import React from "react"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useI18n } from "@/lib/i18n"
import { Icon } from "@/components/icon/Icon"
import type { IconName } from "@/components/icon/icons"
import { cn, formatPathForDisplay } from "@/lib/utils"
import {
  NEEDS_YOU_VISIBLE_ROWS,
  listNeedsYouSessions,
  rankNeedsYouEntries,
  selectNeedsYouSession,
  type NeedsYouReason,
} from "@/lib/needsYou"
import { needsYouReasonLabel } from "@/lib/needsYouLabels"
import { useEnsureDirectoriesGitStatus, useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"

const REASON_ICON: Record<NeedsYouReason, IconName> = {
  permission: "shield-warning",
  question: "question",
  error: "error-warning",
  uncommitted: "git-commit",
}

type NeedsYouQueueProps = {
  className?: string
}

/**
 * Sessions across the portfolio that are waiting on a person: a permission or a question, an error,
 * or finished work that is not committed. Most urgent first, each row names its project, and the
 * list stays bounded. Renders nothing when no session needs anyone.
 */
export const NeedsYouQueue: React.FC<NeedsYouQueueProps> = ({ className }) => {
  const { t } = useI18n()
  const projects = useProjectsStore((state) => state.projects)
  const setActiveProject = useProjectsStore((state) => state.setActiveProject)
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab)
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession)
  const inputs = useNeedsYouSessionInputs()
  const [expanded, setExpanded] = React.useState(false)

  // "Finished with uncommitted changes" comes from git status, so warm it for every session directory.
  const directories = React.useMemo(() => {
    const set = new Set<string>()
    for (const session of inputs) if (session.directory) set.add(session.directory)
    return Array.from(set)
  }, [inputs])
  useEnsureDirectoriesGitStatus(directories)

  const queue = React.useMemo(() => rankNeedsYouEntries(listNeedsYouSessions(inputs)), [inputs])

  const projectLabel = React.useCallback(
    (projectId: string | null, directory: string | null) => {
      const project = projectId ? projects.find((entry) => entry.id === projectId) : undefined
      const label = project?.label?.trim()
      if (label) return label
      const path = project?.path ?? directory
      return path ? formatPathForDisplay(path, homeDirectory) : null
    },
    [homeDirectory, projects],
  )

  const open = React.useCallback(
    (sessionId: string) => {
      const selectedId = selectNeedsYouSession(sessionId)
      const session = inputs.find((item) => item.id === selectedId)
      if (session?.projectId) setActiveProject(session.projectId)
      setActiveMainTab("chat")
      setCurrentSession(selectedId, session?.directory ?? null)
    },
    [inputs, setActiveMainTab, setActiveProject, setCurrentSession],
  )

  if (queue.length === 0) return null

  const visible = expanded ? queue : queue.slice(0, NEEDS_YOU_VISIBLE_ROWS)

  return (
    <section
      data-needs-you-list
      aria-label={t("projects.home.needsYou.title")}
      className={cn("flex w-full flex-col", className)}
    >
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-warning)]" aria-hidden />
        <h2 className="typography-ui-label font-medium text-foreground">{t("projects.home.needsYou.title")}</h2>
        <span className="typography-micro text-muted-foreground">{queue.length}</span>
      </div>
      <div className="surface-inset flex flex-col gap-0.5 p-1">
        {visible.map((entry) => {
          const project = projectLabel(entry.projectId, entry.directory)
          return (
            <button
              key={entry.sessionId}
              type="button"
              data-needs-you-reason={entry.reason}
              className="surface-inset-row flex w-full min-w-0 items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
              onClick={() => open(entry.sessionId)}
            >
              <Icon name={REASON_ICON[entry.reason]} className="h-3.5 w-3.5 shrink-0 text-[var(--status-warning)]" />
              <span className="min-w-0 flex-1 truncate typography-ui-label text-foreground">{entry.title}</span>
              {project ? (
                <span className="hidden min-w-0 max-w-[40%] truncate typography-micro text-muted-foreground sm:inline">
                  {project}
                </span>
              ) : null}
              <span className="shrink-0 typography-micro text-[var(--status-warning)]">
                {needsYouReasonLabel(entry.reason, t)}
              </span>
            </button>
          )
        })}
        {queue.length > NEEDS_YOU_VISIBLE_ROWS ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="rounded-md px-2.5 py-1 text-left typography-micro text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
          >
            {expanded
              ? t("projects.home.needsYou.showFewer")
              : t("projects.home.needsYou.showAll", { count: String(queue.length) })}
          </button>
        ) : null}
      </div>
    </section>
  )
}
