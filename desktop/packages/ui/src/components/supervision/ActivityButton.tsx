import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import type { ActivityFeedEvent } from "@/lib/supervision/activityFeed"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { cn } from "@/lib/utils"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"

import { MissionControlActivityFeed } from "./missionControl/MissionControlActivityFeed"

/**
 * Titlebar entry to the cross-session Activity feed, so "what happened while I was away" is reachable from anywhere, not
 * only from Mission Control. The count is unread events; choosing one opens its session.
 */
export const ActivityButton: React.FC = () => {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const rows = useSupervisionRows()
  const unread = useActivityFeedStore((state) => state.events.filter((event) => event.at > state.seenAt).length)
  const label = unread > 0 ? t("supervision.missionControl.feed.toggleUnread", { count: unread }) : t("supervision.missionControl.feed.toggle")

  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Focus moves into the panel when it opens and back to the button when it closes, so keyboard users keep their place.
  React.useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const trigger = triggerRef.current
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      // A chosen session moves focus to its own view; only restore when focus would otherwise be lost.
      if (!document.activeElement || document.activeElement === document.body || panelRef.current?.contains(document.activeElement))
        trigger?.focus()
    }
  }, [open])

  const openEvent = (event: ActivityFeedEvent) => {
    const row = rows.find((candidate) => candidate.sessionId === event.sessionId)
    // A session that is no longer listed is not substituted by another one.
    if (!row) return
    openSupervisedSession({ sessionId: row.sessionId, projectId: row.projectId, directory: row.directory })
    setOpen(false)
  }

  return (
    <div className="relative inline-flex" data-activity-button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "app-region-no-drag relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
              open && "bg-interactive-hover text-foreground",
            )}
          >
            <Icon name="chat-history" className="h-[18px] w-[18px]" aria-hidden="true" />
            {unread > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--status-info)] px-1 text-center typography-micro leading-4 text-white"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label={t("supervision.missionControl.feed.title")}
            className="app-region-no-drag absolute right-0 top-full z-50 mt-1.5 flex max-h-[460px] w-[360px] max-w-[calc(100vw-1rem)] flex-col overflow-auto rounded-xl border border-border bg-[var(--surface-elevated)] shadow-popover"
          >
            <MissionControlActivityFeed onSelectSession={openEvent} />
          </div>
        </>
      ) : null}
    </div>
  )
}
