import React from "react"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { getInstallCommandHighlights } from "./installCommands"
import type { OnboardingPlatform } from "./types"

interface InstallCommandDisplayProps {
  platform: OnboardingPlatform
  layout: "centered" | "spread"
  copied: boolean
  onCopy: () => void
}

export function InstallCommandDisplay(props: InstallCommandDisplayProps): React.ReactNode {
  const { t } = useI18n()
  if (props.copied) {
    return (
      <div
        className={props.layout === "centered" ? "flex items-center justify-center gap-2" : "flex items-center gap-2"}
        style={{ color: "var(--status-success)" }}
      >
        <Icon name="check" className="h-4 w-4" />
        {t("onboarding.common.status.copiedToClipboard")}
      </div>
    )
  }
  return (
    <div
      className={
        props.layout === "centered"
          ? "flex items-center justify-center gap-3 max-w-full"
          : "flex items-center justify-between gap-3 w-full"
      }
    >
      <code
        className={
          props.layout === "centered"
            ? "overflow-x-auto whitespace-nowrap text-left"
            : "flex-1 text-left overflow-x-auto whitespace-nowrap"
        }
      >
        {getInstallCommandHighlights(props.platform).map((part, index) => {
          if (part.kind === "keyword" || part.kind === "string") {
            return (
              <span key={index} style={{ color: `var(--syntax-${part.kind})` }}>
                {part.text}
              </span>
            )
          }
          return (
            <span key={index} className="text-muted-foreground">
              {part.text}
            </span>
          )
        })}
      </code>
      <button
        onClick={props.onCopy}
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={t("onboarding.common.copyToClipboard")}
        aria-label={t("onboarding.common.copyToClipboard")}
      >
        <Icon name="file-copy" className="h-4 w-4" />
      </button>
    </div>
  )
}
