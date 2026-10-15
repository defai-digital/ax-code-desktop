import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useSupervisionRow } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import {
  shouldShowSinceYouLeft,
  sinceYouLeftRelativeParts,
  sinceYouLeftStateLabel,
} from "@/lib/supervision/sinceYouLeft"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { EvidenceText } from "./EvidenceText"

type SinceYouLeftStripProps = {
  sessionId: string
}

/**
 * "Since you left" strip: shown when a session changed while the user was elsewhere.
 * The leave time is snapshotted once per session id, because useSessionVisitTracking
 * overwrites lastViewedAt when the user leaves again.
 */
export const SinceYouLeftStrip: React.FC<SinceYouLeftStripProps> = ({ sessionId }) => {
  const { t, relativeTime } = useI18n()
  const [dismissedFor, setDismissedFor] = React.useState<string | null>(null)
  const snapshot = React.useMemo(() => useSupervisionStore.getState().lastViewedAt[sessionId] ?? null, [sessionId])

  const row = useSupervisionRow(sessionId)
  if (!row) return null
  if (dismissedFor === sessionId) return null
  if (!shouldShowSinceYouLeft({ snapshot, updatedAt: row.updatedAt, state: row.state })) return null
  const label = sinceYouLeftStateLabel(row.state)
  if (!label) return null

  const parts = sinceYouLeftRelativeParts(row.updatedAt, Date.now())

  return (
    <div
      className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border/40 bg-[var(--surface-elevated)] px-3"
      data-since-you-left="true"
    >
      <span className="typography-ui-label text-foreground">{t("supervision.sinceYouLeft.title")}</span>
      <span className="typography-meta text-muted-foreground">
        {t(`supervision.sinceYouLeft.state.${label}` as Parameters<typeof t>[0])}
      </span>
      <EvidenceText evidence={row.evidence} fallback="none" className="typography-meta text-muted-foreground" />
      <span className="typography-meta text-muted-foreground">{relativeTime(parts.value, parts.unit)}</span>
      <span className="flex-1" />
      {row.evidence ? (
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => openBesideChat("diff")}>
          {t("supervision.sinceYouLeft.reviewChanges")}
        </Button>
      ) : null}
      <button
        type="button"
        onClick={() => setDismissedFor(sessionId)}
        aria-label={t("supervision.sinceYouLeft.dismiss")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--interactive-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
      >
        <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
