import type { StatusMarkKind } from "@/components/supervision/StatusMark"
import type { I18nKey } from "@/lib/i18n"
import type { SupervisionState } from "./sessionState"

/**
 * How each supervision state is drawn. The shape carries the state and the status colour reinforces it; the state
 * word is always printed in the foreground colour, so no state depends on colour alone.
 */
type StatePresentation = { label: I18nKey; mark: StatusMarkKind; dot: string }

export const SUPERVISION_PRESENTATION: Record<SupervisionState, StatePresentation> = {
  permission: { label: "supervision.state.permission", mark: "needs", dot: "bg-[var(--status-warning)]" },
  question: { label: "supervision.state.question", mark: "needs", dot: "bg-[var(--status-warning)]" },
  error: { label: "supervision.state.error", mark: "failed", dot: "bg-[var(--status-error)]" },
  goal: { label: "supervision.state.goal", mark: "needs", dot: "bg-[var(--status-warning)]" },
  review: { label: "supervision.state.review", mark: "review", dot: "bg-[var(--status-info)]" },
  running: { label: "supervision.state.running", mark: "running", dot: "bg-[var(--status-success)]" },
  idle: { label: "supervision.state.idle", mark: "idle", dot: "bg-muted-foreground/50" },
}
