import React from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import type { ProjectEntry } from "@/lib/api/types"
import { axCodeClient } from "@/lib/ax-code/client"
import { generateBranchName } from "@/lib/git/branchNameGenerator"
import { useI18n } from "@/lib/i18n"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import { checkIsGitRepository } from "@/lib/gitApi"
import { createWorktreeWithDefaults } from "@/lib/worktrees/worktreeCreate"
import { removeProjectWorktree } from "@/lib/worktrees/worktreeManager"
import {
  createDispatchToken,
  dispatchStillShowingAttempt,
  planQuickDispatchCompletion,
  planQuickDispatchFailure,
  quickDispatchSessionLabel,
  reduceDispatchToken,
} from "@/lib/supervision/quickDispatch"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { cn } from "@/lib/utils"
import { useConfigStore } from "@/stores/useConfigStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGitStore } from "@/stores/useGitStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { MESSAGE_QUEUE_MAX_PER_SESSION, useMessageQueueStore } from "@/stores/messageQueueStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { getAllSyncSessions } from "@/sync/sync-refs"
import { useAllLiveSessions } from "@/sync/sync-context"

const RECENT_LIMIT = 5

const projectDisplayLabel = (project: ProjectEntry): string => {
  const label = project.label?.trim()
  if (label) return label
  const parts = project.path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || project.path
}

const knownSessionIds = (previousSessionId: string | null): Set<string> => {
  const ids = new Set<string>()
  if (previousSessionId) ids.add(previousSessionId)
  for (const session of getAllSyncSessions()) ids.add(session.id)
  const global = useGlobalSessionsStore.getState()
  for (const session of global.activeSessions) ids.add(session.id)
  for (const session of global.archivedSessions) ids.add(session.id)
  for (const sessions of global.sessionsByDirectory.values()) {
    for (const session of sessions) ids.add(session.id)
  }
  return ids
}

const labelForCreatedSession = (sessionId: string, prompt: string): string => {
  const global = useGlobalSessionsStore.getState()
  const session =
    global.activeSessions.find((item) => item.id === sessionId) ??
    global.archivedSessions.find((item) => item.id === sessionId)
  return quickDispatchSessionLabel({ title: session?.title, prompt, sessionId })
}

type QuickDispatchResult =
  | { ok: true }
  | { ok: false; reason: "no-model" | "failed" | "worktree-failed" }
  | { ok: false; reason: "created"; sessionId: string; label: string; directory: string }

/**
 * Start a session through the same draft path the composer uses, then either open it or
 * return to the view that was on screen. The draft path clears the current session, so the
 * previous target is captured before the draft opens. A dispatch token records the session
 * this attempt creates; the previous view is restored only while that session (or the draft)
 * is still what the user is looking at.
 */
const startQuickDispatch = async (input: {
  project: ProjectEntry
  prompt: string
  openAfter: boolean
  isolateWorktree: boolean
}): Promise<QuickDispatchResult> => {
  let targetDirectory = input.project.path
  const projectRef = { id: input.project.id, path: input.project.path }
  let createdWorktree: Awaited<ReturnType<typeof createWorktreeWithDefaults>> | null = null
  if (input.isolateWorktree) {
    try {
      createdWorktree = await createWorktreeWithDefaults(projectRef, { preferredName: generateBranchName() })
      if (!createdWorktree?.path) {
        return { ok: false, reason: "worktree-failed" }
      }
      targetDirectory = createdWorktree.path
    } catch {
      return { ok: false, reason: "worktree-failed" }
    }
  }
  // A dispatch that never produced a session must not leave its worktree and branch behind. Once a session exists the
  // worktree is that session's home and stays.
  let sendStarted = false
  const discardUnusedWorktree = async () => {
    if (!createdWorktree) return
    // A send can fail after the runtime created the session but before any store here learned of it. That session
    // lives in this worktree, and removing the worktree would delete its files and branch. An unused worktree left
    // behind can be removed by hand; deleted work cannot be recovered. So once the send started, keep it.
    if (sendStarted) return
    await removeProjectWorktree(projectRef, createdWorktree, { deleteLocalBranch: true }).catch(() => {})
  }

  const session = useSessionUIStore.getState()
  const previousSessionId = session.currentSessionId
  const previousSessionDirectory = previousSessionId ? session.getDirectoryForSession(previousSessionId) : null
  const previousDirectoryPath = useDirectoryStore.getState().currentDirectory

  const restorePreviousView = async () => {
    const current = useSessionUIStore.getState()
    if (previousSessionId) {
      current.setCurrentSession(previousSessionId, previousSessionDirectory ?? previousDirectoryPath)
    } else {
      if (current.newSessionDraft.open) current.closeNewSessionDraft()
      current.setCurrentSession(null)
      if (previousDirectoryPath && useDirectoryStore.getState().currentDirectory !== previousDirectoryPath) {
        useDirectoryStore.getState().setDirectory(previousDirectoryPath)
      }
    }
    const directoryToRestore = previousSessionDirectory ?? previousDirectoryPath
    if (directoryToRestore) {
      await useConfigStore.getState().activateDirectory(directoryToRestore)
    }
  }

  try {
    session.openNewSessionDraft({
      selectedProjectId: input.project.id,
      directoryOverride: targetDirectory,
      // The dispatch is always an Agent prompt; the project's own work mode is not its to change.
      preserveWorkMode: true,
    })
  } catch {
    await discardUnusedWorktree()
    return { ok: false, reason: "failed" }
  }

  const known = knownSessionIds(previousSessionId)
  let token = createDispatchToken()
  const unsubscribe = useSessionUIStore.subscribe((state) => {
    token = reduceDispatchToken(token, state.currentSessionId, known)
  })

  const currentView = () => {
    const current = useSessionUIStore.getState()
    return { sessionId: current.currentSessionId, draftOpen: current.newSessionDraft.open }
  }

  try {
    await useConfigStore.getState().activateDirectory(targetDirectory)

    // The person moved on while the directory was activating: to another session (known or not), or to a draft for
    // another directory. Sending now would deliver this prompt there instead of to a new session here.
    const view = useSessionUIStore.getState()
    const draftElsewhere =
      view.newSessionDraft.open &&
      Boolean(view.newSessionDraft.directoryOverride) &&
      view.newSessionDraft.directoryOverride !== targetDirectory
    if (token.superseded || token.createdSessionId || view.currentSessionId || draftElsewhere) {
      throw new Error("superseded")
    }

    const config = useConfigStore.getState()
    if (!config.currentProviderId || !config.currentModelId) {
      throw new Error("no-model")
    }

    sendStarted = true
    await useSessionUIStore
      .getState()
      .sendMessage(
        input.prompt,
        config.currentProviderId,
        config.currentModelId,
        config.currentAgentName?.trim() ? config.currentAgentName : undefined,
        undefined,
        undefined,
        undefined,
        config.currentVariant,
      )

    const completion = planQuickDispatchCompletion({
      openAfter: input.openAfter,
      createdSessionId: token.createdSessionId,
      showingAttempt: dispatchStillShowingAttempt(token, currentView()),
    })
    if (completion.type === "open") {
      openSupervisedSession({
        sessionId: completion.sessionId,
        projectId: input.project.id,
        directory: useSessionUIStore.getState().getDirectoryForSession(completion.sessionId) ?? targetDirectory,
      })
    } else if (completion.type === "restore") {
      await restorePreviousView()
    }
    return { ok: true }
  } catch (error) {
    const failure = planQuickDispatchFailure({
      noModel: error instanceof Error && error.message === "no-model",
      createdSessionId: token.createdSessionId,
      superseded: token.superseded,
      currentSessionId: useSessionUIStore.getState().currentSessionId,
    })
    if (failure.restore) await restorePreviousView().catch(() => {})
    if (failure.report === "created" && token.createdSessionId) {
      const sessionId = token.createdSessionId
      return {
        ok: false,
        reason: "created",
        sessionId,
        label: labelForCreatedSession(sessionId, input.prompt),
        directory: useSessionUIStore.getState().getDirectoryForSession(sessionId) ?? targetDirectory,
      }
    }
    if (!token.createdSessionId) await discardUnusedWorktree()
    if (failure.report === "no-model") return { ok: false, reason: "no-model" }
    return { ok: false, reason: "failed" }
  } finally {
    unsubscribe()
  }
}

export const QuickDispatchDialog: React.FC = () => {
  const { t } = useI18n()
  const open = useSupervisionStore((state) => state.quickDispatchOpen)
  const setQuickDispatchOpen = useSupervisionStore((state) => state.setQuickDispatchOpen)
  const recentSessionIds = useSupervisionStore((state) => state.recentSessionIds)
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides)
  const projects = useProjectsStore((state) => state.projects)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const rows = useSupervisionRows()
  const sessions = useAllLiveSessions()
  const currentModelId = useConfigStore((state) => state.currentModelId)
  const activeDirectoryKey = useConfigStore((state) => state.activeDirectoryKey)

  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [openAfter, setOpenAfter] = React.useState(false)
  const [isolateWorktree, setIsolateWorktree] = React.useState(true)
  const [starting, setStarting] = React.useState(false)
  const startingRef = React.useRef(false)
  const promptRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) return
    setPrompt("")
    setFilter("")
    setOpenAfter(false)
    setIsolateWorktree(true)
    const projectsState = useProjectsStore.getState()
    setProjectId(projectsState.activeProjectId ?? projectsState.projects[0]?.id ?? null)
    const timer = window.setTimeout(() => promptRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  React.useEffect(() => {
    if (!open || projectId) return
    const next = activeProjectId ?? projects[0]?.id ?? null
    if (next) setProjectId(next)
  }, [activeProjectId, open, projectId, projects])

  const filteredProjects = React.useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => {
      const label = projectDisplayLabel(project).toLowerCase()
      return label.includes(query) || project.path.toLowerCase().includes(query)
    })
  }, [filter, projects])

  const recent = React.useMemo(() => {
    const rowById = new Map(rows.map((row) => [row.sessionId, row]))
    const sessionById = new Map(sessions.map((session) => [session.id, session]))
    const items: Array<{
      sessionId: string
      title: string
      projectId: string | null
      directory: string | null
      projectLabel: string | null
    }> = []
    for (const sessionId of recentSessionIds) {
      if (items.length >= RECENT_LIMIT) break
      const row = rowById.get(sessionId)
      const session = sessionById.get(sessionId)
      items.push({
        sessionId,
        title: row?.title || session?.title?.trim() || sessionId,
        projectId: row?.projectId ?? null,
        directory: row?.directory ?? useSessionUIStore.getState().getDirectoryForSession(sessionId),
        projectLabel: row?.projectLabel ?? null,
      })
    }
    return items
  }, [recentSessionIds, rows, sessions])

  const selectedProject = projects.find((project) => project.id === projectId) ?? null
  // Projects that were never opened have no Git state loaded, so an unknown answer is probed instead of read as
  // "not a repository": that would silently turn isolation off for exactly the projects dispatched from afar.
  const knownGitRepo = useGitStore((state) => {
    if (!selectedProject) return false
    return (
      state.repoSummaries.get(selectedProject.path)?.isGitRepo ??
      state.directories.get(selectedProject.path)?.isGitRepo ??
      null
    )
  })
  const [probedGitRepo, setProbedGitRepo] = React.useState<{ path: string; isGitRepo: boolean } | null>(null)
  const [probeFailedPath, setProbeFailedPath] = React.useState<string | null>(null)
  const [probeAttempt, setProbeAttempt] = React.useState(0)
  const selectedPath = selectedProject?.path ?? null
  React.useEffect(() => {
    if (!open || !selectedPath || knownGitRepo !== null) return
    let cancelled = false
    // A failed probe leaves the state unknown and the start disabled: treating it as "not a repository" would
    // dispatch into the shared tree of a Git project.
    void checkIsGitRepository(selectedPath).then(
      (isGitRepo) => {
        if (!cancelled) setProbedGitRepo({ path: selectedPath, isGitRepo })
      },
      () => {
        if (!cancelled) setProbeFailedPath(selectedPath)
      },
    )
    return () => {
      cancelled = true
      // An answer does not outlive its probe: the folder can become a repository before the dialog opens again.
      setProbedGitRepo(null)
      setProbeFailedPath(null)
    }
  }, [open, selectedPath, knownGitRepo, probeAttempt])
  const gitRepoState = knownGitRepo ?? (probedGitRepo?.path === selectedPath ? probedGitRepo.isGitRepo : null)
  const isGitRepo = gitRepoState === true
  const effectiveIsolateWorktree = isGitRepo && isolateWorktree
  // Starting while the repository check is open could dispatch into the shared tree of a Git project.
  const canStart = Boolean(selectedProject && prompt.trim() && !starting && gitRepoState !== null)
  const dispatchShortcut = formatShortcutForDisplay(getEffectiveShortcutCombo("open_quick_dispatch", shortcutOverrides))
  const startShortcut = formatShortcutForDisplay("mod+enter")

  const start = React.useCallback(async () => {
    // The keyboard shortcut reaches here without the disabled button, so the repository check is enforced again.
    if (!selectedProject || !prompt.trim() || startingRef.current || gitRepoState === null) return
    const project = selectedProject
    startingRef.current = true
    setStarting(true)
    try {
      const result = await startQuickDispatch({
        project,
        prompt: prompt.trim(),
        openAfter,
        isolateWorktree: effectiveIsolateWorktree,
      })
      if (result.ok) {
        setQuickDispatchOpen(false)
        return
      }
      if (result.reason === "no-model") {
        toast.error(t("chat.chatInput.toast.noModelSelected"))
        return
      }
      if (result.reason === "worktree-failed") {
        toast.error(t("supervision.dispatch.worktreeFailed"))
        return
      }
      if (result.reason === "created") {
        toast.error(t("supervision.dispatch.createdFailed", { title: result.label }), {
          action: {
            label: t("supervision.dispatch.openCreated"),
            onClick: () => {
              openSupervisedSession({
                sessionId: result.sessionId,
                projectId: project.id,
                directory: result.directory,
              })
            },
          },
        })
        setQuickDispatchOpen(false)
        return
      }
      toast.error(t("session.githubIssuePicker.toast.startSessionFailed"))
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }, [effectiveIsolateWorktree, gitRepoState, openAfter, prompt, selectedProject, setQuickDispatchOpen, t])

  const jumpTo = (item: (typeof recent)[number]) => {
    openSupervisedSession({
      sessionId: item.sessionId,
      projectId: item.projectId,
      directory: item.directory,
    })
    setQuickDispatchOpen(false)
  }

  const sendToRecent = async (item: (typeof recent)[number]) => {
    if (startingRef.current) return
    const content = prompt.trim()
    if (!content) {
      jumpTo(item)
      return
    }

    const choice = useSessionUIStore.getState().getLastUserChoice(item.sessionId)
    const config = useConfigStore.getState()
    const providerID = choice?.providerID || config.currentProviderId
    const modelID = choice?.modelID || config.currentModelId
    if (!providerID || !modelID) {
      toast.error(t("chat.chatInput.toast.noModelSelected"))
      return
    }
    if (!item.directory) {
      toast.error(t("session.githubIssuePicker.toast.startSessionFailed"))
      return
    }
    const sendConfig = {
      providerID,
      modelID,
      agent: (choice?.agent ?? config.currentAgentName) || undefined,
      variant: (choice?.variant ?? config.currentVariant) || undefined,
    }

    startingRef.current = true
    setStarting(true)
    try {
      if (rows.some((row) => row.sessionId === item.sessionId && row.state === "running")) {
        const queued = useMessageQueueStore.getState().addToQueue(item.sessionId, { content, sendConfig })
        if (!queued) {
          toast.error(t("chat.queuedMessage.full", { count: MESSAGE_QUEUE_MAX_PER_SESSION }))
          return
        }
      } else {
        await axCodeClient.withDirectory(item.directory, () =>
          axCodeClient.sendMessage({ id: item.sessionId, text: content, ...sendConfig }),
        )
      }
      if (openAfter) {
        openSupervisedSession({ sessionId: item.sessionId, projectId: item.projectId, directory: item.directory })
      }
      setQuickDispatchOpen(false)
    } catch {
      toast.error(t("session.githubIssuePicker.toast.startSessionFailed"))
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setQuickDispatchOpen}>
      <DialogContent
        className="max-w-lg"
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.repeat || !(event.metaKey || event.ctrlKey)) return
          event.preventDefault()
          void start()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("supervision.dispatch.title")}</DialogTitle>
          <DialogDescription>{t("supervision.dispatch.description", { shortcut: dispatchShortcut })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="typography-ui-label text-foreground">{t("supervision.dispatch.project")}</span>
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("supervision.dispatch.filterProjects")}
              aria-label={t("supervision.dispatch.filterProjects")}
            />
            {projects.length === 0 ? (
              <p className="typography-micro text-muted-foreground">{t("supervision.dispatch.noProjects")}</p>
            ) : (
              <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border/60 p-1">
                {filteredProjects.length === 0 ? (
                  <p className="px-2 py-1.5 typography-micro text-muted-foreground">{t("search.noResults")}</p>
                ) : (
                  filteredProjects.map((project) => {
                    const selected = project.id === projectId
                    return (
                      <button
                        key={project.id}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "flex min-w-0 flex-col items-start rounded-md px-2 py-1.5 text-left",
                          selected ? "bg-interactive-active text-foreground" : "hover:bg-interactive-hover",
                        )}
                        onClick={() => setProjectId(project.id)}
                      >
                        <span className="truncate typography-ui-label text-foreground">
                          {projectDisplayLabel(project)}
                        </span>
                        <span className="truncate typography-micro text-muted-foreground">{project.path}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </label>

          {selectedProject ? (
            <div className="typography-micro text-muted-foreground">
              <p>{t("supervision.dispatch.targetPreview", { path: selectedProject.path })}</p>
              {gitRepoState !== null ? (
                <p data-dispatch-isolation-hint>
                  {t(
                    effectiveIsolateWorktree
                      ? "supervision.dispatch.worktreeHint"
                      : "supervision.dispatch.sharedDirectoryHint",
                  )}
                </p>
              ) : null}
              {gitRepoState === null ? (
                probeFailedPath === selectedProject.path ? (
                  <p data-dispatch-repo-check="failed" role="alert">
                    {t("supervision.dispatch.repoCheckFailed")}{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                      onClick={() => setProbeAttempt((attempt) => attempt + 1)}
                    >
                      {t("supervision.dispatch.repoCheckRetry")}
                    </button>
                  </p>
                ) : (
                  <p data-dispatch-repo-check="pending">{t("supervision.dispatch.repoChecking")}</p>
                )
              ) : null}
              {effectiveIsolateWorktree ? (
                <p data-dispatch-fail-closed-hint>{t("supervision.dispatch.failClosedHint")}</p>
              ) : null}
              {currentModelId && activeDirectoryKey === selectedProject.path ? (
                <p>{t("supervision.dispatch.targetModel", { model: currentModelId })}</p>
              ) : null}
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="typography-ui-label text-foreground">{t("supervision.dispatch.prompt")}</span>
            <Textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t("supervision.dispatch.promptPlaceholder")}
              aria-label={t("supervision.dispatch.prompt")}
              rows={4}
            />
          </label>

          <div
            className="flex cursor-pointer items-center gap-2"
            role="button"
            tabIndex={0}
            aria-pressed={openAfter}
            onClick={() => setOpenAfter(!openAfter)}
            onKeyDown={(event) => {
              // The checkbox activates Space on keyup; toggling here as well would cancel it out.
              if (event.key === " " && event.target !== event.currentTarget) return
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault()
                setOpenAfter(!openAfter)
              }
            }}
          >
            <Checkbox checked={openAfter} onChange={setOpenAfter} ariaLabel={t("supervision.dispatch.openSession")} />
            <span className="typography-ui-label text-foreground">{t("supervision.dispatch.openSession")}</span>
          </div>

          {isGitRepo ? (
            <div
              className="flex cursor-pointer items-center gap-2"
              role="button"
              tabIndex={0}
              aria-pressed={isolateWorktree}
              data-dispatch-isolate-worktree
              onClick={() => setIsolateWorktree(!isolateWorktree)}
              onKeyDown={(event) => {
                if (event.key === " " && event.target !== event.currentTarget) return
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault()
                  setIsolateWorktree(!isolateWorktree)
                }
              }}
            >
              <Checkbox
                checked={isolateWorktree}
                onChange={setIsolateWorktree}
                ariaLabel={t("supervision.dispatch.isolateWorktree")}
              />
              <span className="typography-ui-label text-foreground">{t("supervision.dispatch.isolateWorktree")}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:items-center">
          <span className="typography-micro text-muted-foreground sm:mr-auto">{startShortcut}</span>
          <Button disabled={!canStart} onClick={() => void start()}>
            {t("supervision.dispatch.start")}
          </Button>
        </DialogFooter>

        {recent.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-border/40 pt-3">
            <span className="typography-micro text-muted-foreground">{t("supervision.dispatch.recent")}</span>
            <p className="typography-micro text-muted-foreground">{t("supervision.dispatch.recentHint")}</p>
            {recent.map((item) => (
              <button
                key={item.sessionId}
                type="button"
                className="flex min-w-0 flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-interactive-hover"
                disabled={starting}
                onClick={() => void sendToRecent(item)}
              >
                <span className="truncate typography-ui-label text-foreground">{item.title}</span>
                {prompt.trim() ? (
                  <span className="typography-micro text-muted-foreground">
                    {t("supervision.dispatch.sendToRecent")}
                  </span>
                ) : null}
                {item.projectLabel ? (
                  <span className="truncate typography-micro text-muted-foreground">{item.projectLabel}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
