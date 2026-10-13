import React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { isElectronShell } from "@/lib/desktop"
import { useOpenProjectBrowser, useWebMcpSummary } from "@/hooks/useWebMcpBrowser"
import { WebMcpStatusDot } from "@/components/mcp/WebMcpBrowserTools"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"

// The header is a window drag region; without the no-drag marker a click would move the window.
const HEADER_BUTTON_CLASS =
  "app-region-no-drag relative inline-flex h-8 items-center gap-1.5 rounded-md px-2 typography-meta text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"

/**
 * The one header control that says "WebMCP" out loud. It opens the project browser in agent mode
 * and shows the live agent-access state, so the feature is findable without knowing that it lives
 * inside the browser panel. Only the desktop app has the native browser, so the web build hides it.
 */
export const WebMcpHeaderButton: React.FC = () => {
  const { t } = useI18n()
  const summary = useWebMcpSummary()
  const enabled = useWebMcpBrowserStore((state) => state.enabled)
  const openProjectBrowser = useOpenProjectBrowser()
  if (!isElectronShell()) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => openProjectBrowser()}
          aria-label={t("webmcp.header.aria", { state: summary.stateLabel })}
          aria-pressed={enabled}
          className={cn(HEADER_BUTTON_CLASS, enabled && "text-foreground")}
        >
          <Icon name="global" className="h-[18px] w-[18px]" />
          <span className="font-medium">WebMCP</span>
          <WebMcpStatusDot tone={summary.tone} className={cn(enabled && "status-dot-running")} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {t("webmcp.title")} · {summary.stateLabel}
        </p>
        <p className="typography-micro text-muted-foreground">{summary.detail}</p>
      </TooltipContent>
    </Tooltip>
  )
}
