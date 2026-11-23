import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/useNow"
import { useSupervisionRow } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { SUPERVISION_PRESENTATION } from "@/lib/supervision/presentation"
import {
  shouldShowSinceYouLeft,
  sinceYouLeftActivityAt,
  sinceYouLeftHookBlocks,
  sinceYouLeftRelativeParts,
} from "@/lib/supervision/sinceYouLeft"
import { useDirectoryHookCounters, useHookActivityStore } from "@/stores/useHookActivityStore"
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
  const now = useNow()
  const [dismissedFor, setDismissedFor] = React.useState<string | null>(null)
  const snapshot = React.useMemo(() => useSupervisionStore.getState().lastViewedAt[sessionId] ?? null, [sessionId])

  const row = useSupervisionRow(sessionId)
  const hookCounters = useDirectoryHookCounters(row?.directory)
  if (!row) return null
  if (dismissedFor === sessionId) return null
  const activityAt = sinceYouLeftActivityAt(row.updatedAt, row.goal)
  if (!shouldShowSinceYouLeft({ snapshot, updatedAt: activityAt, state: row.state })) return null

  const parts = sinceYouLeftRelativeParts(activityAt, now)
  const hookBlocks = sinceYouLeftHookBlocks(hookCounters.blocked)

  const handleDismiss = () => {
    setDismissedFor(sessionId)
    // Dismissing acknowledges the "since you left" items, hook blocks included.
    if (row.directory) useHookActivityStore.getState().clearDirectoryCounters(row.directory)
  }

  return (
    // Wraps instead of overflowing (G UX-08): the title, state word, hook chip and age keep their width, the evidence
    // takes what is left and truncates (full text on hover), and when the line is too narrow the evidence and the
    // actions move to a second line together, so the state word and Review never leave the strip.
    <div
      className="flex min-h-9 flex-shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border/40 bg-[var(--surface-elevated)] px-3 py-1"
      data-since-you-left="true"
    >
      <span className="shrink-0 typography-ui-label text-foreground">{t("supervision.sinceYouLeft.title")}</span>
      <span className="shrink-0 typography-meta text-muted-foreground" data-since-you-left-state>
        {t(SUPERVISION_PRESENTATION[row.state].label)}
      </span>
      {hookBlocks !== null ? (
        <span
          data-hook-blocks-chip="true"
          className="shrink-0 rounded border border-border/60 px-1 typography-micro text-muted-foreground"
        >
          {t("supervision.sinceYouLeft.hookBlocks", { count: hookBlocks })}
        </span>
      ) : null}
      <span className="shrink-0 typography-meta text-muted-foreground">{relativeTime(parts.value, parts.unit)}</span>
      <EvidenceText
        evidence={row.evidence}
        fallback="none"
        showTitle
        className="min-w-0 flex-1 basis-48 truncate typography-meta text-muted-foreground"
      />
      <span className="ml-auto flex shrink-0 items-center gap-1" data-since-you-left-actions>
        {row.evidence ? (
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => openBesideChat("diff")}>
            {t("supervision.sinceYouLeft.reviewChanges")}
          </Button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("supervision.sinceYouLeft.dismiss")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--interactive-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
        >
          <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}
