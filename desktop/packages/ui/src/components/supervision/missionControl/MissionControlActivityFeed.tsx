import React from "react"

import { useI18n } from "@/lib/i18n"
import type { ActivityFeedEvent } from "@/lib/supervision/activityFeed"
import { sinceYouLeftRelativeParts } from "@/lib/supervision/sinceYouLeft"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { SupervisionStateBadge } from "../SupervisionStateBadge"

export interface MissionControlActivityFeedProps {
  /** Selects the session the same way a Mission Control row click does. */
  onSelectSession: (event: ActivityFeedEvent) => void
}

export const MissionControlActivityFeed: React.FC<MissionControlActivityFeedProps> = ({ onSelectSession }) => {
  const { t, relativeTime } = useI18n()
  const events = useActivityFeedStore((state) => state.events)
  const seenAt = useActivityFeedStore((state) => state.seenAt)
  const markAllSeen = useActivityFeedStore((state) => state.markAllSeen)
  const now = Date.now()

  const handleMarkAllRead = () => {
    markAllSeen(Date.now())
  }

  return (
    <section
      className="mission-activity-feed"
      aria-label={t("supervision.missionControl.feed.title")}
      data-activity-feed=""
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate typography-ui-label text-foreground">
          {t("supervision.missionControl.feed.title")}
        </h2>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="normal-case shrink-0 rounded px-2 py-1 typography-micro text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("supervision.missionControl.feed.markAllRead")}
        </button>
      </div>
      {events.length === 0 ? (
        <p className="px-3 py-6 typography-meta text-muted-foreground">{t("supervision.missionControl.feed.empty")}</p>
      ) : (
        <div
          role="list"
          aria-label={t("supervision.missionControl.feed.listLabel")}
          className="mission-activity-feed-list"
        >
          {events.map((event) => {
            const unread = event.at > seenAt
            const parts = sinceYouLeftRelativeParts(event.at, now)
            const stamp = new Date(event.at)
            const dateTime = Number.isNaN(stamp.getTime()) ? undefined : stamp.toISOString()
            const handleClick = (click: React.MouseEvent<HTMLButtonElement>) => {
              onSelectSession(event)
              click.currentTarget.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true })
            }
            return (
              <div role="listitem" key={event.id}>
                <button
                  type="button"
                  onClick={handleClick}
                  data-activity-event={event.id}
                  data-activity-session={event.sessionId}
                  className="flex w-full min-w-0 flex-col items-start gap-1 border-b border-border/50 px-3 py-2 text-left hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex w-full min-w-0 flex-wrap items-center gap-2">
                    {unread ? (
                      <span
                        data-activity-unread=""
                        aria-label={t("supervision.missionControl.feed.unread")}
                        className="shrink-0 rounded-full border border-[var(--status-info)]/40 px-1.5 typography-micro text-[var(--status-info)]"
                      >
                        {t("supervision.missionControl.feed.unread")}
                      </span>
                    ) : null}
                    <SupervisionStateBadge state={event.to} />
                    <time dateTime={dateTime} className="ml-auto shrink-0 typography-micro text-muted-foreground">
                      {relativeTime(parts.value, parts.unit)}
                    </time>
                  </span>
                  <span className="w-full truncate typography-ui-label text-foreground" title={event.title}>
                    {event.title}
                  </span>
                  {event.projectLabel ? (
                    <span className="w-full truncate typography-meta text-muted-foreground">{event.projectLabel}</span>
                  ) : null}
                  {event.browser ? (
                    <span className="w-full truncate typography-meta text-muted-foreground" data-activity-browser>
                      {t(
                        event.browser.enabled
                          ? "supervision.missionControl.feed.browserOn"
                          : "supervision.missionControl.feed.browserOff",
                        { origin: event.browser.origin },
                      )}
                    </span>
                  ) : null}
                  {event.preview ? (
                    <span className="w-full truncate typography-meta text-muted-foreground" title={event.preview}>
                      {event.preview}
                    </span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
