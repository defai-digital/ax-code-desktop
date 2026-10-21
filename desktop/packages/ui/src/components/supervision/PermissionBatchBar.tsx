import React from "react"

import { Button } from "@/components/ui/button"
import { withTimeout } from "@/lib/asyncTimeout"
import { useI18n } from "@/lib/i18n"
import { permissionBatchSignature, type PermissionBatch } from "@/lib/supervision/batchRequests"
import {
  requestDecisionKey,
  submitRequestDecision,
  useRequestDecisionStore,
} from "@/stores/useRequestDecisionStore"

type Decision = "once" | "reject"

/** The same bound the in-session permission card uses, so a stalled runtime cannot lock the group. */
const BATCH_REPLY_TIMEOUT_MS = 20_000

const PATTERN_PREVIEW_LIMIT = 6

type Outcome = { accepted: number; unconfirmed: number }

/**
 * One decision for several pending requests of the same permission and risk class. It only ever answers "once" or "reject"
 * for the requests listed now: no standing grant, no rule for future requests. A first click arms the decision and shows
 * every scope it covers; the second click sends it, but only if the set is still exactly the one that was armed. The
 * individual cards stay below for anything that needs a closer look.
 */
export const PermissionBatchBar: React.FC<{ batch: PermissionBatch }> = ({ batch }) => {
  const { t } = useI18n()
  const [armed, setArmed] = React.useState<{ decision: Decision; signature: string } | null>(null)
  const [sending, setSending] = React.useState(false)
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)
  const count = batch.entries.length
  const signature = permissionBatchSignature(batch)
  // Checked when the decision is sent, not only in an effect: a set that changed since arming is never answered.
  const armedFor = armed?.signature === signature ? armed.decision : null

  const decide = async (decision: Decision) => {
    if (sending) return
    if (armedFor !== decision) {
      setOutcome(null)
      setArmed({ decision, signature })
      return
    }
    setSending(true)
    const identities = batch.entries.map((entry) => ({
      kind: "permission" as const,
      sessionId: entry.sessionId,
      requestId: entry.request.id,
    }))
    try {
      await Promise.all(
        identities.map((identity) =>
          withTimeout(submitRequestDecision(identity, decision), BATCH_REPLY_TIMEOUT_MS, () => undefined),
        ),
      )
    } finally {
      const records = useRequestDecisionStore.getState().records
      const accepted = identities.filter((identity) => {
        const phase = records.get(requestDecisionKey(identity))?.phase
        return phase === "accepted" || phase === "resolved"
      }).length
      setOutcome({ accepted, unconfirmed: identities.length - accepted })
      setSending(false)
      setArmed(null)
    }
  }

  const preview = batch.patterns.slice(0, PATTERN_PREVIEW_LIMIT)
  const hidden = batch.patterns.length - preview.length

  return (
    <div
      role="group"
      aria-label={t("supervision.batch.groupLabel", { count, permission: batch.permission })}
      aria-busy={sending}
      data-permission-batch={batch.permission}
      className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 typography-micro text-muted-foreground">
          {t(batch.sessionCount === 1 ? "supervision.batch.summarySingle" : "supervision.batch.summary", {
            count,
            permission: batch.permission,
            sessions: batch.sessionCount,
          })}
        </span>
        <Button
          type="button"
          size="sm"
          variant={armedFor === "once" ? "default" : "outline"}
          className="h-7 px-2 typography-micro"
          disabled={sending}
          onClick={() => void decide("once")}
        >
          {armedFor === "once"
            ? t("supervision.batch.confirmAllow", { count, permission: batch.permission })
            : t("supervision.batch.allowAll", { count })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={armedFor === "reject" ? "destructive" : "ghost"}
          className="h-7 px-2 typography-micro"
          disabled={sending}
          onClick={() => void decide("reject")}
        >
          {armedFor === "reject"
            ? t("supervision.batch.confirmDeny", { count, permission: batch.permission })
            : t("supervision.batch.denyAll", { count })}
        </Button>
      </div>
      {armedFor && preview.length > 0 ? (
        <ul aria-label={t("supervision.batch.scopes")} className="flex flex-wrap gap-1">
          {preview.map((pattern) => (
            <li key={pattern} className="max-w-full truncate rounded border border-border/60 px-1.5 font-mono typography-micro">
              {pattern}
            </li>
          ))}
          {hidden > 0 ? (
            <li className="typography-micro text-muted-foreground">{t("supervision.batch.moreScopes", { count: hidden })}</li>
          ) : null}
        </ul>
      ) : null}
      <p role="status" aria-live="polite" className="typography-micro text-muted-foreground empty:hidden">
        {sending
          ? t("supervision.batch.sending", { count })
          : armedFor
            ? t("supervision.batch.armed")
            : outcome
              ? outcome.unconfirmed > 0
                ? t("supervision.batch.partial", { accepted: outcome.accepted, unconfirmed: outcome.unconfirmed })
                : t("supervision.batch.done", { count: outcome.accepted })
              : ""}
      </p>
    </div>
  )
}
