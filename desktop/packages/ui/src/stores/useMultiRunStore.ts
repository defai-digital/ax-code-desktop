import { create } from "zustand"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { routeMessage, useSessionUIStore } from "@/sync/session-ui-store"
import { devtools } from "zustand/middleware"
import type { CreateMultiRunParams, CreateMultiRunResult } from "@/types/multirun"
import { axCodeClient } from "@/lib/ax-code/client"
import { saveWorktreeSetupCommands } from "@/lib/openchamberConfig"
import type { ProjectRef } from "@/lib/worktrees/worktreeManager"
import { createWorktreeWithDefaults, resolveRootTrackingRemote } from "@/lib/worktrees/worktreeCreate"
import { removeProjectWorktree } from "@/lib/worktrees/worktreeManager"
import type { WorktreeMetadata } from "@/types/worktree"
import { getRootBranch } from "@/lib/worktrees/worktreeStatus"
import { normalizeWorktreePath } from "@/lib/worktrees/path"
import { checkIsGitRepository } from "@/lib/gitApi"
import { useDirectoryStore } from "./useDirectoryStore"
import { useProjectsStore } from "./useProjectsStore"
import { useSnippetsStore } from "./useSnippetsStore"
import { getMultiRunSessionTitle } from "@/lib/multirun/title"
import { getSyncChildStores, registerSessionDirectory } from "@/sync/sync-refs"
import { seedSessionAutoAccept } from "./utils/sessionAutoAcceptSeed"

const toGitSafeSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50)
}

const toModelSlug = (providerID: string, modelID: string): string => {
  const provider = toGitSafeSlug(providerID)
  const model = toGitSafeSlug(modelID)
  return `${provider}-${model}`.substring(0, 60)
}

const generateWorktreeNameSeed = (groupSlug: string, modelSlug: string): string => {
  return `${groupSlug}/${modelSlug}`
}

const registerCreatedSession = (session: Session, directory: string): Session => {
  const normalizedDirectory = normalizeWorktreePath(directory)
  const sessionDirectory = (session as Session & { directory?: string | null }).directory
  const sessionWithDirectory =
    typeof sessionDirectory === "string" && sessionDirectory.trim().length > 0
      ? session
      : ({ ...session, directory: normalizedDirectory } as Session)

  registerSessionDirectory(session.id, normalizedDirectory)
  // No useGlobalSessionsStore write (S4.5): the session.created bus event is
  // the writer of record for the global index — it reaches the store for every
  // directory via sync/global-session-events.ts. Only the per-directory child
  // store is seeded here (best-effort) so an already-open directory shows the
  // session without waiting for its own event reducer pass.

  try {
    const store = getSyncChildStores().ensureChild(normalizedDirectory, { bootstrap: false })
    store.setState((state) => {
      const existingIndex = state.session.findIndex((candidate) => candidate.id === session.id)
      if (existingIndex >= 0 && state.session[existingIndex] === sessionWithDirectory) {
        return state
      }

      const nextSessions =
        existingIndex >= 0
          ? state.session.map((candidate, index) => (index === existingIndex ? sessionWithDirectory : candidate))
          : [...state.session, sessionWithDirectory].sort((a, b) => a.id.localeCompare(b.id))

      return {
        session: nextSessions,
        sessionTotal: Math.max(state.sessionTotal, nextSessions.length),
        limit: Math.max(state.limit, nextSessions.length),
      }
    })
  } catch {
    // SyncProvider can be unavailable in tests or detached surfaces; the
    // session.created event still feeds the global index for the sidebar.
  }

  return sessionWithDirectory
}

const resolveActiveProject = (): ProjectRef | null => {
  const projectsState = useProjectsStore.getState()
  const activeProjectId = projectsState.activeProjectId
  if (!activeProjectId) return null

  const project = projectsState.projects.find((entry) => entry.id === activeProjectId)
  if (project?.path) return { id: project.id, path: project.path }

  const currentDirectory = useDirectoryStore.getState().currentDirectory ?? null
  if (currentDirectory && currentDirectory.trim().length > 0) {
    const normalized = normalizeWorktreePath(currentDirectory)
    return { id: `path:${normalized}`, path: normalized }
  }

  return null
}

interface MultiRunState {
  isLoading: boolean
  error: string | null
}

interface MultiRunActions {
  createMultiRun: (params: CreateMultiRunParams) => Promise<CreateMultiRunResult | null>
  clearError: () => void
}

type MultiRunStore = MultiRunState & MultiRunActions

export const useMultiRunStore = create<MultiRunStore>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

      createMultiRun: async (params: CreateMultiRunParams) => {
        const groupName = params.name.trim()
        const { groups, agent, files, setupCommands } = params

        if (!groupName) {
          set({ error: "Group name is required" })
          return null
        }

        if (!groups || groups.length === 0) {
          set({ error: "At least one run group is required" })
          return null
        }

        for (let gi = 0; gi < groups.length; gi++) {
          if (!groups[gi].prompt.trim()) {
            set({ error: `Group ${gi + 1}: prompt is required` })
            return null
          }
          if (groups[gi].models.length < 1) {
            set({ error: `Group ${gi + 1}: select at least 1 model` })
            return null
          }
          if (groups[gi].models.length > 5) {
            set({ error: `Group ${gi + 1}: maximum 5 models allowed` })
            return null
          }
        }

        set({ isLoading: true, error: null })

        try {
          const project = resolveActiveProject()
          if (!project) {
            set({ error: "Select a project", isLoading: false })
            return null
          }

          const directory = project.path

          const isGit = await checkIsGitRepository(directory)
          const shouldIsolateRuns = isGit && params.isolateRuns !== false

          const groupSlug = toGitSafeSlug(groupName)
          const rootBranch = shouldIsolateRuns ? await getRootBranch(directory) : undefined
          const rootTrackingRemote = shouldIsolateRuns ? await resolveRootTrackingRemote(directory) : null

          const createdRuns: Array<{
            sessionId: string
            worktreePath: string
            providerID: string
            modelID: string
            variant?: string
            prompt: string
          }> = []

          const commandsToRun = setupCommands?.filter((cmd) => cmd.trim().length > 0) ?? []

          for (let gi = 0; gi < groups.length; gi++) {
            const group = groups[gi]
            const prompt = group.prompt

            const modelCounts = new Map<string, number>()
            for (const model of group.models) {
              const key = `${model.providerID}:${model.modelID}`
              modelCounts.set(key, (modelCounts.get(key) || 0) + 1)
            }

            const modelIndexes = new Map<string, number>()

            for (const model of group.models) {
              const key = `${model.providerID}:${model.modelID}`
              const count = modelCounts.get(key) || 1
              const index = (modelIndexes.get(key) || 0) + 1
              modelIndexes.set(key, index)

              const modelSlug = toModelSlug(model.providerID, model.modelID)
              const runGroup = groups.length > 1 ? `g${gi + 1}` : undefined
              const modelPart =
                count > 1
                  ? generateWorktreeNameSeed(groupSlug, `${modelSlug}/${index}`)
                  : generateWorktreeNameSeed(groupSlug, modelSlug)
              const preferredName = runGroup ? `${runGroup}/${modelPart}` : modelPart

              const sessionTitle = getMultiRunSessionTitle({
                groupSlug,
                runGroup,
                providerID: model.providerID,
                modelID: model.modelID,
                index: count > 1 ? index : undefined,
              })

              // Set only while this iteration owns a worktree with no session yet, so a failure
              // below can roll it back instead of leaving an orphan branch on disk.
              let createdWorktree: WorktreeMetadata | null = null
              try {
                if (!shouldIsolateRuns) {
                  const session = await axCodeClient.withDirectory(directory, () =>
                    axCodeClient.createSession({ title: sessionTitle }),
                  )
                  seedSessionAutoAccept(session.id, null)
                  registerCreatedSession(session, directory)

                  createdRuns.push({
                    sessionId: session.id,
                    worktreePath: directory,
                    providerID: model.providerID,
                    modelID: model.modelID,
                    variant: model.variant,
                    prompt,
                  })
                  continue
                }

                createdWorktree = await createWorktreeWithDefaults(
                  project,
                  {
                    preferredName,
                    mode: "new",
                    branchName: preferredName,
                    worktreeName: preferredName,
                    startRef: params.worktreeBaseBranch || "HEAD",
                    setupCommands: commandsToRun,
                  },
                  {
                    resolvedRootTrackingRemote: rootTrackingRemote,
                  },
                )

                const worktreeMetadata = createdWorktree
                const enrichedMetadata = {
                  ...worktreeMetadata,
                  createdFromBranch: rootBranch,
                  kind: "standard" as const,
                }

                const session = await axCodeClient.withDirectory(worktreeMetadata.path, () =>
                  axCodeClient.createSession({ title: sessionTitle }),
                )
                seedSessionAutoAccept(session.id, null)
                registerCreatedSession(session, worktreeMetadata.path)
                // The session owns the worktree from here on.
                createdWorktree = null

                useSessionUIStore.getState().setWorktreeMetadata(session.id, enrichedMetadata)

                createdRuns.push({
                  sessionId: session.id,
                  worktreePath: worktreeMetadata.path,
                  providerID: model.providerID,
                  modelID: model.modelID,
                  variant: model.variant,
                  prompt,
                })
              } catch (err) {
                console.warn("[MultiRun] Failed to create session:", err)
                if (createdWorktree) {
                  // Nothing else cleans up a worktree whose session was never created: the sidebar
                  // lists git worktrees, so it would linger as an empty run. Same compensation the
                  // single-worktree creator performs.
                  await removeProjectWorktree(project, createdWorktree, { deleteLocalBranch: true }).catch(
                    () => undefined,
                  )
                }
              }
            }
          }

          const commandsToSave = setupCommands?.filter((cmd) => cmd.trim().length > 0) ?? []
          if (commandsToSave.length > 0) {
            saveWorktreeSetupCommands(project, commandsToSave).catch(() => {
              console.warn("[MultiRun] Failed to save worktree setup commands")
            })
          }

          const sessionIds = createdRuns.map((r) => r.sessionId)
          const firstSessionId = createdRuns[0]?.sessionId ?? null

          if (sessionIds.length === 0) {
            set({ error: "Failed to create any sessions", isLoading: false })
            return null
          }

          const filesForMessage = files?.map((f) => ({
            type: "file" as const,
            mime: f.mime,
            filename: f.filename,
            url: f.url,
          }))

          // Awaited: creating the runs and starting them are two round trips, and the caller reports
          // how many prompts actually reached the server. Detaching this reported a full success while
          // a run whose send failed sat empty — its prompt gone, and only a console warning to show for
          // it, because the caller could not know.
          const expandText = useSnippetsStore.getState().expandText
          const dispatchResults = await Promise.all(
            createdRuns.map(async (run) => {
              try {
                const text = await expandText(run.prompt).catch(() => run.prompt)
                await routeMessage({
                  sessionId: run.sessionId,
                  directory: run.worktreePath,
                  content: text,
                  providerID: run.providerID,
                  modelID: run.modelID,
                  variant: run.variant,
                  agent,
                  files: filesForMessage,
                })
                return true
              } catch (err) {
                console.warn("[MultiRun] Failed to start run:", err)
                return false
              }
            }),
          )
          const startedRunCount = dispatchResults.filter(Boolean).length

          set({ isLoading: false })
          return { groupSlug, sessionIds, firstSessionId, startedRunCount }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to create Multi-Run",
            isLoading: false,
          })
          return null
        }
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    { name: "multirun-store" },
  ),
)
