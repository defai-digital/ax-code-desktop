import React from "react"

import { Icon } from "@/components/icon/Icon"
import { useEnsureDirectoriesGitStatus, useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"
import { useI18n } from "@/lib/i18n"
import {
  NEEDS_YOU_VISIBLE_ROWS,
  listFollowUpSessions,
  rankFollowUpEntries,
  type FollowUpEntry,
} from "@/lib/needsYou"
import { ATTENTION_REASON_ICON, needsYouReasonLabel } from "@/lib/needsYouLabels"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { supervisionProjectLabel } from "@/lib/supervision/projectContext"
import { cn } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSyncNotificationStore } from "@/sync/notification-store"
import { useRunStateStore } from "@/sync/run-state-store"

type FollowUpListProps = {
  className?: string
}

/**
 * Sessions that hold no decision but may be worth a look: an unseen failure, or finished work whose changes are
 * still uncommitted. Deliberately quiet (no amber, not part of the Needs you count) and every row can be dismissed.
 * A dismissal marks the session viewed (clearing a failure) and holds finished work dismissed until the next run ends.
 * Renders nothing when there is nothing to follow up on.
 */
export const FollowUpList: React.FC<FollowUpListProps> = ({ className }) => {
  const { t } = useI18n()
  const projects = useProjectsStore((state) => state.projects)
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory)
  const inputs = useNeedsYouSessionInputs()
  const dismissNudge = useRunStateStore((state) => state.dismissNudge)
  const markSessionViewed = useSyncNotificationStore((state) => state.markSessionViewed)
  const [expanded, setExpanded] = React.useState(false)

  // "Finished with uncommitted changes" comes from git status, so warm it for every session directory.
  const directories = React.useMemo(() => {
    const set = new Set<string>()
    for (const session of inputs) if (session.directory) set.add(session.directory)
    return Array.from(set)
  }, [inputs])
  useEnsureDirectoriesGitStatus(directories)

  const entries = React.useMemo(() => rankFollowUpEntries(listFollowUpSessions(inputs)), [inputs])

  const open = React.useCallback(
    (sessionId: string) => {
      const session = inputs.find((item) => item.id === sessionId)
      openSupervisedSession({
        sessionId,
        projectId: session?.projectId,
        directory: session?.directory ?? null,
      })
    },
    [inputs],
  )

  // A session can hold both a failure and finished work; clearing only one would swap the row's reason instead of
  // removing it, so a dismissal clears both.
  const dismiss = React.useCallback(
    (entry: FollowUpEntry) => {
      markSessionViewed(entry.sessionId)
      dismissNudge(entry.sessionId)
    },
    [dismissNudge, markSessionViewed],
  )

  if (entries.length === 0) return null

  const visible = expanded ? entries : entries.slice(0, NEEDS_YOU_VISIBLE_ROWS)

  return (
    <section
      data-follow-up-list
      aria-label={t("projects.home.followUp.title")}
      className={cn("flex w-full flex-col", className)}
    >
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <h2 className="typography-ui-label font-medium text-muted-foreground">{t("projects.home.followUp.title")}</h2>
        <span className="typography-micro text-muted-foreground">{entries.length}</span>
      </div>
      <div className="surface-inset flex flex-col gap-0.5 p-1">
        {visible.map((entry) => {
          const project = supervisionProjectLabel(projects, entry.projectId, entry.directory, homeDirectory)
          return (
            <div key={entry.sessionId} data-follow-up-reason={entry.reason} className="flex items-center gap-1">
              <button
                type="button"
                className="surface-inset-row flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                onClick={() => open(entry.sessionId)}
              >
                <Icon name={ATTENTION_REASON_ICON[entry.reason]} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate typography-ui-label text-foreground">{entry.title}</span>
                  {project ? <span className="break-all typography-micro text-muted-foreground">{project}</span> : null}
                </span>
                <span className="shrink-0 typography-micro text-muted-foreground">
                  {needsYouReasonLabel(entry.reason, t)}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("chat.turnNextSteps.dismiss")}
                title={t("chat.turnNextSteps.dismiss")}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                onClick={() => dismiss(entry)}
              >
                <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })}
        {entries.length > NEEDS_YOU_VISIBLE_ROWS ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="rounded-md px-2.5 py-1 text-left typography-micro text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
          >
            {expanded
              ? t("projects.home.needsYou.showFewer")
              : t("projects.home.needsYou.showAll", { count: String(entries.length) })}
          </button>
        ) : null}
      </div>
    </section>
  )
}
