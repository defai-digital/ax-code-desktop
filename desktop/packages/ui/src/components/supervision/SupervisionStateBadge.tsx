import { useI18n } from "@/lib/i18n"
import { SUPERVISION_PRESENTATION } from "@/lib/supervision/presentation"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"

import { StatusMark } from "./StatusMark"

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
        "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 typography-meta",
        // The word stays in the foreground colour: the mark is the only coloured part of a state.
        state === "idle" ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <StatusMark kind={meta.mark} className={state === "running" ? "motion-safe:animate-spin" : undefined} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </span>
  )
}
