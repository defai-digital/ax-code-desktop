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
import { useI18n } from "@/lib/i18n"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
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
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
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
  | { ok: false; reason: "no-model" | "failed" }
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
}): Promise<QuickDispatchResult> => {
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
        useDirectoryStore.getState().setDirectory(previousDirectoryPath, { showOverlay: false })
      }
    }
    const directoryToRestore = previousSessionDirectory ?? previousDirectoryPath
    if (directoryToRestore) {
      await useConfigStore.getState().activateDirectory(directoryToRestore)
    }
  }

  session.openNewSessionDraft({
    selectedProjectId: input.project.id,
    directoryOverride: input.project.path,
  })

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
    await useConfigStore.getState().activateDirectory(input.project.path)

    const config = useConfigStore.getState()
    if (!config.currentProviderId || !config.currentModelId) {
      throw new Error("no-model")
    }

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
        directory: useSessionUIStore.getState().getDirectoryForSession(completion.sessionId) ?? input.project.path,
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
        directory: useSessionUIStore.getState().getDirectoryForSession(sessionId) ?? input.project.path,
      }
    }
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

  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [openAfter, setOpenAfter] = React.useState(false)
  const [starting, setStarting] = React.useState(false)
  const promptRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) return
    setPrompt("")
    setFilter("")
    setOpenAfter(false)
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
  const canStart = Boolean(selectedProject && prompt.trim() && !starting)
  const dispatchShortcut = formatShortcutForDisplay(getEffectiveShortcutCombo("open_quick_dispatch", shortcutOverrides))
  const startShortcut = formatShortcutForDisplay("mod+enter")

  const start = React.useCallback(async () => {
    if (!selectedProject || !prompt.trim() || starting) return
    const project = selectedProject
    setStarting(true)
    try {
      const result = await startQuickDispatch({ project, prompt: prompt.trim(), openAfter })
      if (result.ok) {
        setQuickDispatchOpen(false)
        return
      }
      if (result.reason === "no-model") {
        toast.error(t("chat.chatInput.toast.noModelSelected"))
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
      setStarting(false)
    }
  }, [openAfter, prompt, selectedProject, setQuickDispatchOpen, starting, t])

  const jumpTo = (item: (typeof recent)[number]) => {
    openSupervisedSession({
      sessionId: item.sessionId,
      projectId: item.projectId,
      directory: item.directory,
    })
    setQuickDispatchOpen(false)
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
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault()
                setOpenAfter(!openAfter)
              }
            }}
          >
            <Checkbox checked={openAfter} onChange={setOpenAfter} ariaLabel={t("supervision.dispatch.openSession")} />
            <span className="typography-ui-label text-foreground">{t("supervision.dispatch.openSession")}</span>
          </div>
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
            {recent.map((item) => (
              <button
                key={item.sessionId}
                type="button"
                className="flex min-w-0 flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-interactive-hover"
                onClick={() => jumpTo(item)}
              >
                <span className="truncate typography-ui-label text-foreground">{item.title}</span>
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
