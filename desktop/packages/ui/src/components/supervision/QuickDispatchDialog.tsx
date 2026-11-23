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
import { waitForWorktreeBootstrap } from "@/lib/worktrees/worktreeBootstrap"
import { createWorktreeWithDefaults } from "@/lib/worktrees/worktreeCreate"
import { quickDispatchSessionLabel } from "@/lib/supervision/quickDispatch"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { cn } from "@/lib/utils"
import { resolveDirectorySendSelection, useConfigStore, type DirectorySendSelection } from "@/stores/useConfigStore"
import { useGitStore } from "@/stores/useGitStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { MESSAGE_QUEUE_MAX_PER_SESSION, useMessageQueueStore } from "@/stores/messageQueueStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { seedSessionAutoAccept } from "@/stores/utils/sessionAutoAcceptSeed"
import { registerCreatedSession } from "@/sync/register-created-session"
import {
  notifyMessageSent,
  routeMessage,
  saveSessionSendSelection,
  useSessionUIStore,
  workModeSendRefusalMessage,
} from "@/sync/session-ui-store"
import { useAllLiveSessions } from "@/sync/sync-context"

const RECENT_LIMIT = 5

const projectDisplayLabel = (project: ProjectEntry): string => {
  const label = project.label?.trim()
  if (label) return label
  const parts = project.path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || project.path
}

const labelForCreatedSession = (sessionId: string, prompt: string): string => {
  const global = useGlobalSessionsStore.getState()
  const session =
    global.activeSessions.find((item) => item.id === sessionId) ??
    global.archivedSessions.find((item) => item.id === sessionId)
  return quickDispatchSessionLabel({ title: session?.title, prompt, sessionId })
}

type QuickDispatchResult =
  | { ok: true; sessionId: string; directory: string }
  | { ok: false; reason: "no-model" | "worktree-failed" | "failed" }
  | { ok: false; reason: "refused"; message: string }
  /** The create request went out and failed; the runtime may still have made the session, so its worktree stays. */
  | { ok: false; reason: "create-unknown"; worktreePath: string }
  | { ok: false; reason: "created"; sessionId: string; label: string; directory: string }

/**
 * The selection the project's new session gets. A project not opened in this run has no provider list yet; loading it
 * for that directory fills its snapshot without switching the composer to it. A worktree shares its repository's
 * configuration, so the project path is the key for both.
 */
const resolveDispatchSelection = async (projectPath: string): Promise<DirectorySendSelection | null> => {
  const known = resolveDirectorySendSelection(useConfigStore.getState(), projectPath)
  if (known) return known
  await useConfigStore.getState().loadProviders({ directory: projectPath })
  return resolveDirectorySendSelection(useConfigStore.getState(), projectPath)
}

/**
 * Start a session in the background, the way Multi-Run starts its runs: the view, the composer and its draft are never
 * touched, and only "Open the session" navigates. Every refusal that can be known in advance (no model, a work mode
 * the model cannot run, no worktree) is decided before anything exists, so those failures leave nothing behind.
 */
const startQuickDispatch = async (input: {
  project: ProjectEntry
  prompt: string
  isolateWorktree: boolean
}): Promise<QuickDispatchResult> => {
  const projectRef = { id: input.project.id, path: input.project.path }
  const selection = await resolveDispatchSelection(input.project.path).catch(() => null)
  if (!selection) return { ok: false, reason: "no-model" }

  let refusal: string | null
  try {
    refusal = await workModeSendRefusalMessage({
      content: input.prompt,
      workMode: undefined,
      providerID: selection.providerID,
      modelID: selection.modelID,
      providers: selection.providers,
    })
  } catch {
    // The send below skips its own check on the strength of this one, so a check that could not run stops it.
    return { ok: false, reason: "failed" }
  }
  if (refusal) return { ok: false, reason: "refused", message: refusal }

  let directory = input.project.path
  let worktree: Awaited<ReturnType<typeof createWorktreeWithDefaults>> | null = null
  if (input.isolateWorktree) {
    try {
      worktree = await createWorktreeWithDefaults(projectRef, { preferredName: generateBranchName() })
    } catch {
      return { ok: false, reason: "worktree-failed" }
    }
    if (!worktree?.path) return { ok: false, reason: "worktree-failed" }
    directory = worktree.path
  }

  let sessionId: string
  try {
    // An explicit directory takes no directory lock, so the request cannot be refused before it is sent.
    const created = await axCodeClient.createSessionInDirectory(directory)
    sessionId = registerCreatedSession(created, directory).id
  } catch {
    // Every failure here comes after the request went out: a lost response or an error body does not prove the
    // runtime made no session. The worktree is also already listed in the sidebar, where it can be picked up, so it
    // stays; the person is told where it is.
    if (worktree) return { ok: false, reason: "create-unknown", worktreePath: worktree.path }
    return { ok: false, reason: "failed" }
  }

  seedSessionAutoAccept(sessionId, null)
  if (worktree) useSessionUIStore.getState().setWorktreeMetadata(sessionId, worktree)
  saveSessionSendSelection(sessionId, selection)

  try {
    if (worktree) await waitForWorktreeBootstrap(directory)
    notifyMessageSent(sessionId)
    await routeMessage({
      sessionId,
      directory,
      content: input.prompt,
      providerID: selection.providerID,
      modelID: selection.modelID,
      agent: selection.agent,
      variant: selection.variant,
      // Admitted above, before the session existed.
      workModeAdmitted: true,
    })
  } catch {
    return {
      ok: false,
      reason: "created",
      sessionId,
      label: labelForCreatedSession(sessionId, input.prompt),
      directory,
    }
  }
  return { ok: true, sessionId, directory }
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
  // The model this dispatch will use, for any project whose providers are known; a cold project resolves on Start.
  const dispatchModelId = useConfigStore((state) =>
    selectedPath ? (resolveDirectorySendSelection(state, selectedPath)?.modelID ?? null) : null,
  )
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
        isolateWorktree: effectiveIsolateWorktree,
      })
      if (result.ok) {
        // Dismissing the dialog while the dispatch ran is leaving it: a late finish must not take the view.
        const stillWaiting = useSupervisionStore.getState().quickDispatchOpen
        setQuickDispatchOpen(false)
        if (openAfter && stillWaiting) {
          openSupervisedSession({ sessionId: result.sessionId, projectId: project.id, directory: result.directory })
        }
        return
      }
      switch (result.reason) {
        case "no-model":
          toast.error(t("chat.chatInput.toast.noModelSelected"))
          return
        case "worktree-failed":
          toast.error(t("supervision.dispatch.worktreeFailed"))
          return
        case "refused":
          toast.error(result.message)
          return
        case "create-unknown":
          toast.error(t("supervision.dispatch.createUnknown", { path: result.worktreePath }))
          return
        case "created":
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
        case "failed":
          toast.error(t("session.githubIssuePicker.toast.startSessionFailed"))
          return
      }
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
              {dispatchModelId ? (
                <p>{t("supervision.dispatch.targetModel", { model: dispatchModelId })}</p>
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
