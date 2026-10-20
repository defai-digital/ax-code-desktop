import React from "react"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useI18n } from "@/lib/i18n"
import { Icon } from "@/components/icon/Icon"
import type { IconName } from "@/components/icon/icons"
import { cn } from "@/lib/utils"
import { supervisionProjectLabel } from "@/lib/supervision/projectContext"
import {
  NEEDS_YOU_VISIBLE_ROWS,
  listNeedsYouSessions,
  rankNeedsYouEntries,
  selectNeedsYouSession,
  type NeedsYouReason,
} from "@/lib/needsYou"
import { needsYouReasonLabel } from "@/lib/needsYouLabels"
import { useEnsureDirectoriesGitStatus, useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"
import { requestsForSessionTree } from "@/lib/supervision/requests"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { supervisionRequestContext } from "@/lib/supervision/needsYouSurface"
import { useAllPendingRequests } from "@/sync/sync-context"
import { RequestActionCard } from "@/components/supervision/RequestActionCard"
import { SupervisionGoalLine } from "@/components/supervision/SupervisionGoalLine"

const REASON_ICON: Record<NeedsYouReason, IconName> = {
  permission: "shield-warning",
  question: "question",
  error: "error-warning",
  goal: "record-circle",
  uncommitted: "git-commit",
}

type NeedsYouQueueProps = {
  className?: string
}

/**
 * Sessions across the portfolio that are waiting on a person: a permission or a question, an error,
 * or finished work that is not committed. A permission or a question can be answered here; other
 * reasons open the session. Most urgent first, each row names its project, and the list stays bounded.
 * Renders nothing when no session needs anyone.
 */
export const NeedsYouQueue: React.FC<NeedsYouQueueProps> = ({ className }) => {
  const { t } = useI18n()
  const projects = useProjectsStore((state) => state.projects)
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const inputs = useNeedsYouSessionInputs()
  const pendingRequests = useAllPendingRequests()
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
    (projectId: string | null, directory: string | null) =>
      supervisionProjectLabel(projects, projectId, directory, homeDirectory),
    [homeDirectory, projects],
  )

  const open = React.useCallback(
    (sessionId: string) => {
      const selectedId = selectNeedsYouSession(sessionId)
      const session = inputs.find((item) => item.id === selectedId)
      openSupervisedSession({
        sessionId: selectedId,
        projectId: session?.projectId,
        directory: session?.directory ?? null,
      })
    },
    [inputs],
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
          const requests =
            entry.reason === "permission" || entry.reason === "question"
              ? requestsForSessionTree(pendingRequests, new Set([entry.sessionId]))
              : []
          if (requests.length > 0) {
            return (
              <div key={entry.sessionId} data-needs-you-reason={entry.reason} className="flex flex-col gap-1">
                {requests.map((request) => (
                  <RequestActionCard
                    key={`${request.kind}:${request.request.id}`}
                    entry={request}
                    density="compact"
                    context={supervisionRequestContext(entry.title, project)}
                    onOpen={() => open(entry.sessionId)}
                  />
                ))}
              </div>
            )
          }
          return (
            <button
              key={entry.sessionId}
              type="button"
              data-needs-you-reason={entry.reason}
              className="surface-inset-row flex w-full min-w-0 items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
              onClick={() => open(entry.sessionId)}
            >
              <Icon name={REASON_ICON[entry.reason]} className="h-3.5 w-3.5 shrink-0 text-[var(--status-warning)]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate typography-ui-label text-foreground">{entry.title}</span>
                {project ? (
                  <span className="break-all typography-micro text-muted-foreground">
                    {project}
                  </span>
                ) : null}
                <SupervisionGoalLine goal={entry.goal} className="typography-micro text-muted-foreground" />
              </span>
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
