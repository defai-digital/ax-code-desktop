import type { IconName } from "@/components/icon/icons"
import type { I18nKey } from "@/lib/i18n"
import type { SupervisionState } from "./sessionState"

type StatePresentation = { label: I18nKey; icon: IconName; tone: string; dot: string }

export const SUPERVISION_PRESENTATION: Record<SupervisionState, StatePresentation> = {
  permission: {
    label: "supervision.state.permission",
    icon: "shield-warning",
    tone: "text-[var(--status-warning)] border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10",
    dot: "bg-[var(--status-warning)]",
  },
  question: {
    label: "supervision.state.question",
    icon: "question",
    tone: "text-[var(--status-warning)] border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10",
    dot: "bg-[var(--status-warning)]",
  },
  error: {
    label: "supervision.state.error",
    icon: "error-warning",
    tone: "text-[var(--status-error)] border-[var(--status-error)]/40 bg-[var(--status-error)]/10",
    dot: "bg-[var(--status-error)]",
  },
  goal: {
    label: "supervision.state.goal",
    icon: "record-circle",
    tone: "text-[var(--status-warning)] border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10",
    dot: "bg-[var(--status-warning)]",
  },
  review: {
    label: "supervision.state.review",
    icon: "file-check",
    tone: "text-[var(--status-info)] border-[var(--status-info)]/40 bg-[var(--status-info)]/10",
    dot: "bg-[var(--status-info)]",
  },
  running: {
    label: "supervision.state.running",
    icon: "loader",
    tone: "text-[var(--status-success)] border-[var(--status-success)]/40 bg-[var(--status-success)]/10",
    dot: "bg-[var(--status-success)]",
  },
  idle: {
    label: "supervision.state.idle",
    icon: "time",
    tone: "text-muted-foreground border-border bg-muted",
    dot: "bg-muted-foreground/50",
  },
}
