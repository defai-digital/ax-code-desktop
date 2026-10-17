import React from "react"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { sinceYouLeftRelativeParts } from "@/lib/supervision/sinceYouLeft"
import { useSessionHookRuns } from "@/stores/useHookActivityStore"
import { cn } from "@/lib/utils"
import { visibleHookRows } from "./hookActivity"

const EMPTY_DISMISSED: ReadonlySet<string> = new Set()

type HookActivityRowsProps = {
  sessionId: string
  className?: string
}

/**
 * Compact one-line notices for hook runs that blocked a tool call or asked
 * for confirmation, pinned with the ActivityBreadcrumb above the composer.
 * Successful and failed runs stay in the supervision surfaces instead.
 */
export const HookActivityRows: React.FC<HookActivityRowsProps> = ({ sessionId, className }) => {
  const { t, relativeTime } = useI18n()
  const runs = useSessionHookRuns(sessionId)
  const [dismissedIds, setDismissedIds] = React.useState<ReadonlySet<string>>(EMPTY_DISMISSED)

  const { visible, hiddenCount } = visibleHookRows(runs, dismissedIds)
  if (visible.length === 0) return null

  const dismiss = (id: string) => {
    setDismissedIds((current) => new Set(current).add(id))
  }

  return (
    <div className={cn("border-t border-border/40 bg-background/60 backdrop-blur-sm", className)}>
      {visible.map((run) => {
        const blocked = run.outcome === "blocked"
        const title = run.tool
          ? t(blocked ? "chat.hookActivity.blocked" : "chat.hookActivity.asked", { tool: run.tool })
          : t(blocked ? "chat.hookActivity.blockedGeneric" : "chat.hookActivity.askedGeneric")
        const sourceLabel =
          run.source === "pack"
            ? run.pack
              ? t("chat.hookActivity.sourcePack", { pack: run.pack })
              : null
            : t("chat.hookActivity.sourceProject")
        const parts = sinceYouLeftRelativeParts(run.receivedAt, Date.now())
        return (
          <div
            key={run.id}
            data-hook-row="true"
            data-hook-outcome={run.outcome}
            className="flex items-center gap-1.5 px-4 py-1 typography-micro text-muted-foreground"
          >
            <Icon name={blocked ? "shield-warning" : "shield"} className="h-3 w-3 shrink-0 opacity-70" />
            <span className="shrink-0 text-foreground/80">{title}</span>
            <span className="shrink-0 opacity-80">{run.event}</span>
            {sourceLabel ? <span className="shrink-0 opacity-60">{sourceLabel}</span> : null}
            {run.reason ? (
              <span className="min-w-0 truncate opacity-80" title={run.reason}>
                {run.reason}
              </span>
            ) : null}
            <span className="ml-auto shrink-0 opacity-60">{relativeTime(parts.value, parts.unit)}</span>
            <button
              type="button"
              onClick={() => dismiss(run.id)}
              aria-label={t("chat.hookActivity.dismiss")}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--interactive-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
            >
              <Icon name="close" className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
      {hiddenCount > 0 ? (
        <div className="px-4 pb-1 typography-micro text-muted-foreground opacity-70">
          {t("chat.hookActivity.more", { count: hiddenCount })}
        </div>
      ) : null}
    </div>
  )
}
