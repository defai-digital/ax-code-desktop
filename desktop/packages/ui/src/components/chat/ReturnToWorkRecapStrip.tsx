import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { isRecapStale, requestSessionRecap, type SessionRecap } from "@/lib/supervision/sessionRecap"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"

interface ReturnToWorkRecapStripProps {
  sessionId: string | null
  directory: string | null
  sessionUpdatedAt?: number | null
  initialRecap: SessionRecap | null
  isIdle: boolean
  hasChanges?: boolean
  onReviewChanges?: () => void
}

/**
 * Catalog keys for the strip. They are added to `en.ts` in the change that mounts
 * the strip; keeping them in one table means the keys themselves stay checked.
 */
const RECAP_MESSAGES = {
  title: "supervision.recap.title",
  stale: "supervision.recap.stale",
  refresh: "supervision.recap.refresh",
  refreshing: "supervision.recap.refreshing",
  reviewChanges: "supervision.recap.reviewChanges",
  dismiss: "supervision.recap.dismiss",
  updatedAgo: "supervision.recap.updatedAgo",
} as const

/**
 * "What happened while you were away" for the session you just returned to:
 * the recap the runtime projected onto the session, plus a best-effort refresh.
 * Refreshing must never lose the recap already on screen, and a reply that
 * arrives after the user switched sessions belongs to nobody.
 */
export const ReturnToWorkRecapStrip: React.FC<ReturnToWorkRecapStripProps> = ({
  sessionId,
  directory,
  sessionUpdatedAt,
  initialRecap,
  isIdle,
  hasChanges,
  onReviewChanges,
}) => {
  const { t } = useI18n()
  const now = useNow()
  const recapT = t

  const [recap, setRecap] = React.useState<SessionRecap | null>(initialRecap)
  const [renderedSessionId, setRenderedSessionId] = React.useState(sessionId)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [dismissedSessionId, setDismissedSessionId] = React.useState<string | null>(null)
  const requestSequence = React.useRef(0)
  const inFlight = React.useRef<AbortController | null>(null)

  // Adjusting state during render keeps the swap atomic: the new session never
  // paints one frame of the previous session's recap.
  if (renderedSessionId !== sessionId) {
    setRenderedSessionId(sessionId)
    setRecap(initialRecap)
    setIsRefreshing(false)
  }

  React.useEffect(() => {
    // Any reply still travelling belongs to the session we just left.
    requestSequence.current += 1
    inFlight.current?.abort()
    inFlight.current = null
    return () => {
      requestSequence.current += 1
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [sessionId])

  const handleRefresh = async () => {
    if (!sessionId) return
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setIsRefreshing(true)
    const next = await requestSessionRecap({
      sessionId,
      directory,
      scope: recap?.scope ?? "conversation",
      signal: controller.signal,
    })
    // A newer request, an unmount, or a session switch supersedes this one.
    if (sequence !== requestSequence.current || controller.signal.aborted) return
    inFlight.current = null
    setIsRefreshing(false)
    if (next) setRecap(next)
  }

  if (!sessionId || !isIdle || dismissedSessionId === sessionId) return null
  if (!recap || recap.text.trim().length === 0) return null

  const stale = isRecapStale(recap, sessionUpdatedAt)
  const age = formatRelativeAge(now - recap.time, t)
  const canReview = Boolean(hasChanges && onReviewChanges)

  return (
    <div
      role="region"
      aria-label={recapT(RECAP_MESSAGES.title)}
      data-return-to-work-recap=""
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-1.5",
        "bg-[var(--surface-elevated)] border border-border/50",
      )}
    >
      <Icon
        name={stale ? "error-warning" : "checkbox-circle"}
        className={cn(
          "h-3.5 w-3.5 flex-shrink-0",
          stale ? "text-[var(--status-warning)]" : "text-[var(--status-success)]",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="typography-ui-label font-medium text-foreground">{recapT(RECAP_MESSAGES.title)}</span>
          <span className="typography-micro text-muted-foreground">{recapT(RECAP_MESSAGES.updatedAgo, { age })}</span>
          {stale ? (
            <span className="typography-micro text-[var(--status-warning)]">{recapT(RECAP_MESSAGES.stale)}</span>
          ) : null}
        </div>
        <p className="typography-micro text-muted-foreground line-clamp-2">{recap.text}</p>
      </div>
      {canReview ? (
        <Button variant="ghost" size="xs" onClick={onReviewChanges}>
          {recapT(RECAP_MESSAGES.reviewChanges)}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        disabled={isRefreshing}
        aria-label={recapT(RECAP_MESSAGES.refresh)}
        onClick={() => {
          void handleRefresh()
        }}
      >
        {isRefreshing ? recapT(RECAP_MESSAGES.refreshing) : recapT(RECAP_MESSAGES.refresh)}
      </Button>
      <button
        type="button"
        onClick={() => setDismissedSessionId(sessionId)}
        aria-label={recapT(RECAP_MESSAGES.dismiss)}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

ReturnToWorkRecapStrip.displayName = "ReturnToWorkRecapStrip"
