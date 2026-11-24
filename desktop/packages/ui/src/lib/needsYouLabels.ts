import type { IconName } from "@/components/icon/icons"
import type { I18nContextValue } from "@/lib/i18n/react-context"
import type { AttentionReason } from "@/lib/needsYou"

export const ATTENTION_REASON_ICON: Record<AttentionReason, IconName> = {
  permission: "shield-warning",
  question: "question",
  error: "error-warning",
  goal: "record-circle",
  uncommitted: "git-commit",
}

/** The reason in the one state vocabulary the board, the strip and notifications use (G UX-01). */
export function needsYouReasonLabel(reason: AttentionReason, t: I18nContextValue["t"]): string {
  switch (reason) {
    case "permission":
      return t("supervision.state.permission")
    case "question":
      return t("supervision.state.question")
    case "uncommitted":
      return t("supervision.state.review")
    case "error":
      return t("supervision.state.error")
    case "goal":
      return t("supervision.state.goal")
  }
}
