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

export function needsYouReasonLabel(reason: AttentionReason, t: I18nContextValue["t"]): string {
  switch (reason) {
    case "permission":
      return t("projects.home.needsYou.permission")
    case "question":
      return t("projects.home.needsYou.question")
    case "uncommitted":
      return t("projects.home.needsYou.uncommitted")
    case "error":
      return t("projects.home.needsYou.error")
    case "goal":
      return t("projects.home.needsYou.goal")
  }
}
