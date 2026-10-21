import React from "react"
import { useI18n } from "@/lib/i18n"
import type { MissionPullRequest } from "@/lib/supervision/pullRequestCache"
import { cn } from "@/lib/utils"

export function MissionControlPullRequest({ pr }: { pr?: MissionPullRequest | null }) {
  const { t } = useI18n()
  if (!pr) return null
  const state = t(`supervision.missionControl.pr.${pr.state}`)
  const checks = pr.checks ? t(`supervision.missionControl.pr.${pr.checks}`) : ""
  const label = [
    t("supervision.missionControl.pr.label", { number: pr.number, state }),
    checks,
    pr.stale ? t("supervision.missionControl.pr.stale") : "",
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-mission-pr={pr.number}
      data-pr-state={pr.state}
      data-pr-checks={pr.checks}
      data-pr-stale={pr.stale ? "true" : undefined}
      className={cn(
        "inline-flex max-w-full flex-wrap gap-1 rounded border border-border/60 px-1.5 py-0.5 typography-micro",
        pr.stale
          ? "text-muted-foreground"
          : pr.checks === "failed"
            ? "text-[var(--status-error)]"
            : pr.checks === "passed"
              ? "text-[var(--status-success)]"
              : "text-muted-foreground",
      )}
    >
      <span aria-hidden="true">
        {pr.stale ? `${t("supervision.missionControl.pr.stale")} · ` : ""}#{pr.number} {state}
        {checks ? ` · ${checks}` : ""}
      </span>
    </span>
  )
}
