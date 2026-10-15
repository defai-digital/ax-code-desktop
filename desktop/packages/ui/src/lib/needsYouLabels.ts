import type { I18nContextValue } from "@/lib/i18n/react-context"
import type { NeedsYouReason } from "@/lib/needsYou"

export function needsYouReasonLabel(reason: NeedsYouReason, t: I18nContextValue["t"]): string {
  switch (reason) {
    case "permission":
      return t("projects.home.needsYou.permission")
    case "question":
      return t("projects.home.needsYou.question")
    case "uncommitted":
      return t("projects.home.needsYou.uncommitted")
    case "error":
      return t("projects.home.needsYou.error")
  }
}
