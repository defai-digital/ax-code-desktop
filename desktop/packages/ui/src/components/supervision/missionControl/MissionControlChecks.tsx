import type { I18nKey } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n"
import type { SessionGoalSnapshot } from "@/lib/supervision/goal"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { useNow } from "@/hooks/useNow"
import type { VerificationEvidence, VerificationEvidenceState } from "@/lib/supervision/verificationEvidence"
import { cn } from "@/lib/utils"

function checksStateKey(state: VerificationEvidenceState): I18nKey {
  return `supervision.missionControl.checks.state.${state}` as I18nKey
}

export function ChecksChip({ checks }: { checks: VerificationEvidence }) {
  const { t, number } = useI18n()
  const label =
    checks.state === "none"
      ? t("supervision.missionControl.checks.none")
      : checks.state === "pending"
        ? t("supervision.missionControl.checks.pending", {
            passed: number(checks.passed),
            total: number(checks.total),
          })
        : t("supervision.missionControl.checks.label", {
            passed: number(checks.passed),
            failed: number(checks.failed),
            total: number(checks.total),
          })
  const fullLabel = checks.stale ? `${label} ${t("supervision.missionControl.checks.stale")}` : label
  return (
    <span
      className={cn(
        "mission-checks rounded border border-border/60 px-1.5 py-0.5 typography-micro",
        checks.stale
          ? "border-dashed text-muted-foreground"
          : [
              checks.state === "passed" && "text-[var(--status-success)]",
              checks.state === "failed" && "text-[var(--status-error)]",
              (checks.state === "pending" || checks.state === "none") && "text-muted-foreground",
            ],
      )}
      data-checks-stale={checks.stale ? "" : undefined}
      data-checks-state={checks.state}
      data-checks-passed={checks.passed}
      data-checks-failed={checks.failed}
      data-checks-total={checks.total}
      title={fullLabel}
    >
      {/* A generic span cannot carry an accessible name, so the full status is real text for assistive technology and
          the short visual label is hidden from it. */}
      <span className="sr-only">{fullLabel}</span>
      <span aria-hidden="true">
        {t("supervision.missionControl.checks.chip", {
          passed: number(checks.passed),
          total: number(checks.total),
        })}
        {checks.stale ? " ?" : ""}
      </span>
    </span>
  )
}

/** Token or time budget the runtime reported as remaining. Other budget fields are not substituted. */
export function GoalBudgetLeft({ goal }: { goal: SessionGoalSnapshot | null | undefined }) {
  const { t, number } = useI18n()
  if (!goal) return null
  const tokens = goal.remainingTokens
  const seconds = goal.remainingTimeSeconds
  if (tokens === undefined && seconds === undefined) return null
  return (
    <span className="mission-budget inline-flex min-w-0 flex-wrap items-center gap-x-1" data-goal-budget>
      {tokens !== undefined ? (
        <span data-goal-budget-tokens>{t("supervision.goal.remainingTokens", { count: number(tokens) })}</span>
      ) : null}
      {seconds !== undefined ? (
        <span data-goal-budget-time>
          {t("supervision.goal.remainingTimeSeconds", { count: number(seconds) })}
        </span>
      ) : null}
    </span>
  )
}

export function ChecksDetail({ checks }: { checks: VerificationEvidence }) {
  const { t, number } = useI18n()
  // Relative label: derive from the shared clock so React Compiler keeps it live.
  const now = useNow()
  return (
    <dl
      data-checks-detail
      aria-label={t("supervision.missionControl.peek.checksTitle")}
      className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 typography-micro text-muted-foreground"
    >
      <dt>{t("supervision.missionControl.peek.checksState")}</dt>
      <dd data-checks-state={checks.state}>{t(checksStateKey(checks.state))}</dd>
      <dt>{t("supervision.missionControl.peek.checksPassed")}</dt>
      <dd>{number(checks.passed)}</dd>
      <dt>{t("supervision.missionControl.peek.checksFailed")}</dt>
      <dd data-checks-failed={checks.failed}>{number(checks.failed)}</dd>
      <dt>{t("supervision.missionControl.peek.checksTotal")}</dt>
      <dd>{number(checks.total)}</dd>
      {checks.updatedAt !== undefined ? (
        <>
          <dt>{t("supervision.missionControl.peek.checksUpdated")}</dt>
          <dd>{formatRelativeAge(now - checks.updatedAt, t)}</dd>
        </>
      ) : null}
    </dl>
  )
}
