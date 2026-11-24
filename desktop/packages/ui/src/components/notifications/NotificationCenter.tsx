import React from "react"
import { useNotificationStore, type NotificationItem } from "@/stores/useNotificationStore"
import { useI18n } from "@/lib/i18n"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { openSupervisedSession } from "@/lib/supervision/openSession"

const NotificationEntry: React.FC<{ item: NotificationItem }> = React.memo(function NotificationEntry({ item }) {
  const { t } = useI18n()

  const typeIcon = item.type === "session" ? "chat-1" : "alert"
  const typeColor = item.type === "session" ? "text-status-success" : "text-muted-foreground"

  const timeLabel = React.useMemo(() => {
    return formatRelativeAge(Date.now() - item.timestamp, t)
  }, [item.timestamp, t])

  const rowClassName = cn(
    "group flex w-full gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors",
    !item.read && "bg-interactive-hover/30",
  )
  const content = (
    <>
      <div className={cn("mt-0.5 flex-shrink-0", typeColor)}>
        <Icon name={typeIcon} className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate typography-micro font-medium text-foreground">{item.title}</span>
          <span className="flex-shrink-0 typography-micro text-muted-foreground">{timeLabel}</span>
        </div>
        <p className="line-clamp-2 typography-micro text-muted-foreground">{item.message}</p>
        {item.projectLabel ? (
          <p className="truncate typography-micro text-muted-foreground">{item.projectLabel}</p>
        ) : null}
      </div>
    </>
  )

  const sessionId = item.sessionId
  if (!sessionId) return <div className={rowClassName}>{content}</div>

  // A follow-up row opens the session it is about (G UX-02).
  const open = () => {
    useNotificationStore.getState().setOpen(false)
    openSupervisedSession({ sessionId, projectId: item.projectId ?? null, directory: item.directory ?? null })
  }
  return (
    <button
      type="button"
      className={cn(
        rowClassName,
        "hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
      onClick={open}
    >
      {content}
    </button>
  )
})

/** Follow-ups only: finished and failed runs. Decisions are answered in the Needs you inbox. */
export const NotificationCenter: React.FC = React.memo(function NotificationCenter() {
  const { t } = useI18n()
  const notifications = useNotificationStore((s) => s.notifications)
  const isOpen = useNotificationStore((s) => s.isOpen)
  const setOpen = useNotificationStore((s) => s.setOpen)
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const wasOpenRef = React.useRef(false)

  const hasNotifications = notifications.length > 0
  const unreadCount = notifications.filter((n) => !n.read).length

  // Mark everything read when the panel closes (from anywhere), not when it
  // opens — the unread badge shouldn't vanish the moment the panel appears.
  React.useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      markAllAsRead()
    }
    wasOpenRef.current = isOpen
  }, [isOpen, markAllAsRead])

  // Focus the panel on open, restore focus on close, and close on Escape.
  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen, setOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="app-region-no-drag fixed inset-0 z-40" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={t("notificationCenter.title")}
        className="app-region-no-drag absolute right-0 top-12 z-50 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="typography-ui-label font-semibold text-foreground">{t("notificationCenter.title")}</span>
            {unreadCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 typography-micro font-medium text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasNotifications && (
              <>
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="rounded px-1.5 py-0.5 typography-micro text-muted-foreground hover:bg-interactive-hover hover:text-foreground transition-colors"
                >
                  {t("notificationCenter.markAllRead")}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded px-1.5 py-0.5 typography-micro text-muted-foreground hover:bg-interactive-hover hover:text-foreground transition-colors"
                >
                  {t("notificationCenter.clearAll")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollableOverlay outerClassName="max-h-96 min-h-[120px]">
          <div className="flex flex-col gap-0.5 p-2">
            {hasNotifications ? (
              notifications.map((item) => (
                <NotificationEntry key={item.id} item={item} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Icon name="checkbox-circle" className="h-8 w-8 text-muted-foreground" />
                <p className="typography-micro font-medium text-muted-foreground">{t("notificationCenter.empty")}</p>
                <p className="typography-micro text-muted-foreground">{t("notificationCenter.emptyDescription")}</p>
              </div>
            )}
          </div>
        </ScrollableOverlay>
      </div>
    </>
  )
})
