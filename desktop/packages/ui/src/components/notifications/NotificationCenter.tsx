import React from "react"
import { useNotificationStore, type NotificationItem } from "@/stores/useNotificationStore"
import { useI18n } from "@/lib/i18n"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"

// Answers in flight, by request (falling back to the notification id). Module scope so the claim survives the
// entry's unmount when the panel closes, and the promise lets the remounted entry learn when the claim is released.
// Keyed by request because the permission watcher adds a fresh notification id for the same pending request when it
// remounts.
const answersInFlight = new Map<string, Promise<void>>()

const NotificationEntry: React.FC<{
  item: NotificationItem
  onRemove: (id: string) => void
}> = React.memo(function NotificationEntry({ item, onRemove }) {
  const { t } = useI18n()

  const typeIcon = item.type === "permission" ? "shield" : item.type === "session" ? "chat-1" : "alert"
  const typeColor =
    item.type === "permission"
      ? "text-status-warning"
      : item.type === "session"
        ? "text-status-success"
        : "text-muted-foreground"

  const timeLabel = React.useMemo(() => {
    return formatRelativeAge(Date.now() - item.timestamp, t)
  }, [item.timestamp, t])

  // The entry leaves only once its answer landed: a reply that failed leaves the permission pending, and removing
  // the entry took away the user's handle on it — the request stayed open somewhere the bell no longer showed.
  // The claim is module-level, not a ref: the panel returns null while closed, so every close unmounts the entry and
  // the reopen would mount a fresh one with a per-entry guard reset while the first answer was still in flight. The
  // remounted entry subscribes to the claim's promise so a failure re-enables its buttons; the state is there for
  // the buttons' disabled attribute.
  const answerKey = item.requestId ?? item.id
  const inheritedClaim = answersInFlight.get(answerKey)
  const [responding, setResponding] = React.useState(Boolean(inheritedClaim))
  React.useEffect(() => {
    if (!inheritedClaim) return
    let active = true
    const settle = () => {
      if (active) setResponding(false)
    }
    void inheritedClaim.then(settle, settle)
    return () => {
      active = false
    }
  }, [inheritedClaim])
  const respond = React.useCallback(
    async (handler: (() => void | Promise<void>) | undefined) => {
      if (answersInFlight.has(answerKey)) return
      const answer = Promise.resolve().then(() => handler?.())
      answersInFlight.set(answerKey, answer)
      setResponding(true)
      try {
        await answer
      } catch {
        answersInFlight.delete(answerKey)
        setResponding(false)
        return
      }
      answersInFlight.delete(answerKey)
      // The watcher can hold two notifications for one request (a re-mirror with a fresh id). Removing only the
      // entry that answered would leave the other answerable once its claim subscription re-enables it.
      if (item.requestId) {
        for (const sibling of useNotificationStore.getState().notifications) {
          if (sibling.requestId === item.requestId) onRemove(sibling.id)
        }
      } else {
        onRemove(item.id)
      }
    },
    [answerKey, item.id, item.requestId, onRemove],
  )

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors",
        !item.read && "bg-interactive-hover/30",
      )}
    >
      <div className={cn("mt-0.5 flex-shrink-0", typeColor)}>
        <Icon name={typeIcon} className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate typography-micro font-medium text-foreground">{item.title}</span>
          <span className="flex-shrink-0 typography-micro text-muted-foreground">{timeLabel}</span>
        </div>
        <p className="line-clamp-2 typography-micro text-muted-foreground">{item.message}</p>
        {item.type === "permission" && item.onAllow && item.onDeny && (
          <div className="mt-1.5 flex gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-6 px-2 typography-micro"
              disabled={responding}
              onClick={() => {
                void respond(item.onAllow)
              }}
            >
              {t("notificationCenter.allow")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 typography-micro"
              disabled={responding}
              onClick={() => {
                void respond(item.onDeny)
              }}
            >
              {t("notificationCenter.deny")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})

export const NotificationCenter: React.FC = React.memo(function NotificationCenter() {
  const { t } = useI18n()
  const notifications = useNotificationStore((s) => s.notifications)
  const isOpen = useNotificationStore((s) => s.isOpen)
  const setOpen = useNotificationStore((s) => s.setOpen)
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const removeNotification = useNotificationStore((s) => s.removeNotification)
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
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={t("notificationCenter.title")}
        className="absolute right-0 top-12 z-50 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg outline-none"
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
              notifications.map((item) => <NotificationEntry key={item.id} item={item} onRemove={removeNotification} />)
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
