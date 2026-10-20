import { useI18n } from "@/lib/i18n"
import type { SessionGoalSnapshot } from "@/lib/supervision/goal"
import {
  goalBudgetUsage,
  goalRemaining,
  goalRemainingTimeKey,
  goalStatusLabelKey,
  goalTimeParts,
  goalUsedTimeKey,
} from "@/lib/supervision/goalLine"
import { cn } from "@/lib/utils"

/**
 * One line for a session goal: the runtime status, the objective on a single line and what is left
 * of a reported budget. The full objective stays available through the title attribute.
 */
export function SupervisionGoalLine({
  goal,
  className,
}: {
  goal: SessionGoalSnapshot | null | undefined
  className?: string
}) {
  const { t, number } = useI18n()
  if (!goal) return null
  const remaining = goalRemaining(goal)
  const usage = goalBudgetUsage(goal)
  const remainingText =
    remaining === null
      ? null
      : remaining.kind === "tokens"
        ? t("supervision.goal.remainingTokens", { count: number(remaining.amount) })
        : t(goalRemainingTimeKey(remaining.unit), { count: number(remaining.count) })
  const usedParts = usage?.kind === "time" ? goalTimeParts(usage.usedSeconds) : null
  const usedText =
    usage === null
      ? null
      : usage.kind === "tokens"
        ? t("supervision.goal.usedTokens", { used: number(usage.used), total: number(usage.total) })
        : t(goalUsedTimeKey(usedParts!.unit), { count: number(usedParts!.count) })
  const budget = usedText && remainingText ? `${usedText}, ${remainingText}` : remainingText
  return (
    <span data-goal-line="true" className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span className="shrink-0">{t(goalStatusLabelKey(goal.status))}</span>
      <span className="min-w-0 truncate" title={goal.objective}>
        {goal.objective}
      </span>
      {budget ? <span className="shrink-0">{budget}</span> : null}
    </span>
  )
}
