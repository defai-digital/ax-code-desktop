import React from "react"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { isElectronShell } from "@/lib/desktop"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { WebMcpStatusDot } from "@/components/mcp/WebMcpBrowserTools"
import { useOpenProjectBrowser, useWebMcpSummary } from "@/hooks/useWebMcpBrowser"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"

interface WebMcpComposerChipProps {
  className?: string
  iconSizeClass?: string
}

/**
 * The WebMCP chip in the composer footer, beside the sandbox toggle, where the AX Code terminal
 * UI keeps its own WebMCP chip. Clicking it opens the project browser and, while agent access is
 * off, asks the pane to turn it on once the browser is ready; that click is the user's explicit
 * consent. While access is on, the click only focuses the pane, which owns the disconnect control.
 */
export const WebMcpComposerChip: React.FC<WebMcpComposerChipProps> = ({
  className,
  iconSizeClass = "h-[18px] w-[18px]",
}) => {
  const { t } = useI18n()
  const summary = useWebMcpSummary()
  const enabled = useWebMcpBrowserStore((state) => state.enabled)
  const busy = useWebMcpBrowserStore((state) => state.busy)
  const openProjectBrowser = useOpenProjectBrowser()
  if (!isElectronShell()) return null

  const label = `${t("webmcp.title")} · ${summary.stateLabel}`
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={enabled}
          onClick={() => openProjectBrowser({ enable: !enabled && !busy })}
          onMouseDown={(event) => {
            // Keep focus in the composer textarea, like the neighbouring controls.
            event.preventDefault()
          }}
          className={cn(
            "flex h-7 flex-shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground outline-none transition-colors",
            "hover:bg-interactive-hover hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
            enabled && "bg-interactive-selection text-[var(--status-info)] hover:text-[var(--status-info)]",
            className,
          )}
        >
          <Icon name="global" className={cn(iconSizeClass, "flex-shrink-0")} />
          <span className="typography-micro font-medium">WebMCP</span>
          <WebMcpStatusDot tone={summary.tone} className={cn("h-1.5 w-1.5", enabled && "status-dot-running")} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        <p>{label}</p>
        <p className="typography-micro text-muted-foreground">{summary.detail}</p>
      </TooltipContent>
    </Tooltip>
  )
}
