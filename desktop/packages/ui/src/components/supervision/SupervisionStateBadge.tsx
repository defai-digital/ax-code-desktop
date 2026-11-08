import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { SUPERVISION_PRESENTATION } from "@/lib/supervision/presentation"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"

interface SupervisionStateBadgeProps {
  state: SupervisionState
  retrying?: boolean
}

export function SupervisionStateBadge(props: SupervisionStateBadgeProps) {
  const { state, retrying } = props
  const { t } = useI18n()
  const meta = SUPERVISION_PRESENTATION[state]
  const label = t(state === "running" && retrying ? "miniChat.status.retry" : meta.label)
  return (
    <span
      data-supervision-state={state}
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 typography-meta",
        meta.tone,
      )}
    >
      {state === "running" || state === "idle" ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            meta.dot,
            state === "running" && "motion-safe:animate-pulse",
          )}
        />
      ) : (
        <Icon name={meta.icon} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </span>
  )
}
