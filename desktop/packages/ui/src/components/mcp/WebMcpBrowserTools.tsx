import React from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import type { WebMcpTone } from "@/lib/webMcpSummary"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { useOpenProjectBrowser, useWebMcpCapabilityProbe, useWebMcpSummary } from "@/hooks/useWebMcpBrowser"

/**
 * "Project browser (WebMCP)" surfaces: the tools the current web page exposes through native
 * WebMCP. MCP servers are configured processes; browser tools are whatever the page you opened
 * registers. Both appear wherever the user manages tools, but agent access for the page is only
 * switched inside the project browser itself.
 */
export const WebMcpStatusDot: React.FC<{ tone: WebMcpTone; className?: string }> = ({ tone, className }) => (
  <span
    aria-hidden
    className={cn(
      "status-dot",
      tone === "success" && "bg-status-success",
      tone === "warning" && "bg-status-warning",
      tone === "error" && "bg-status-error",
      tone === "default" && "bg-muted-foreground/40",
      className,
    )}
  />
)

/** Compact row for the Services → MCP dropdown. */
export const WebMcpToolsRow: React.FC<{ onOpen?: () => void; className?: string }> = ({ onOpen, className }) => {
  const { t } = useI18n()
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  useWebMcpCapabilityProbe(currentDirectory ?? null)
  const summary = useWebMcpSummary()
  const openProjectBrowser = useOpenProjectBrowser()
  const handleOpen = React.useCallback(() => {
    openProjectBrowser()
    onOpen?.()
  }, [onOpen, openProjectBrowser])
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-2", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <WebMcpStatusDot tone={summary.tone} />
          <span className="typography-ui-label truncate text-foreground">{t("webmcp.title")}</span>
          <span className="typography-micro text-muted-foreground">{summary.stateLabel}</span>
        </div>
        <p className="typography-micro mt-0.5 truncate pl-4 text-muted-foreground" title={summary.detail}>
          {summary.detail}
        </p>
      </div>
      {summary.canOpen ? (
        <Button type="button" size="xs" variant="outline" className="shrink-0 gap-1" onClick={handleOpen}>
          <Icon name="global" className="h-3.5 w-3.5" />
          {t("webmcp.actions.open")}
        </Button>
      ) : null}
    </div>
  )
}

/** Full card for Settings → MCP. */
export const WebMcpToolsCard: React.FC = () => {
  const { t } = useI18n()
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  useWebMcpCapabilityProbe(currentDirectory ?? null)
  const summary = useWebMcpSummary()
  const openProjectBrowser = useOpenProjectBrowser()
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen)
  const handleOpen = React.useCallback(() => {
    openProjectBrowser()
    setSettingsDialogOpen(false)
  }, [openProjectBrowser, setSettingsDialogOpen])

  return (
    <div className="mx-auto w-full max-w-3xl p-3 sm:p-6 sm:pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Icon name="global" className="h-5 w-5 text-muted-foreground" />
        <h2 className="typography-ui-header font-medium text-foreground">{t("webmcp.title")}</h2>
      </div>
      <p className="typography-meta mb-5 max-w-prose text-muted-foreground">{t("webmcp.settings.description")}</p>

      <div className="surface-inset p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WebMcpStatusDot tone={summary.tone} />
              <span className="typography-ui-label font-medium text-foreground">{summary.stateLabel}</span>
            </div>
            <p className="typography-meta mt-1 text-muted-foreground">{summary.detail}</p>
          </div>
          {summary.canOpen ? (
            <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={handleOpen}>
              <Icon name="global" className="h-3.5 w-3.5" />
              {t("webmcp.actions.open")}
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="surface-inset p-4">
          <dt className="typography-ui-label font-medium text-foreground">{t("webmcp.settings.servers.title")}</dt>
          <dd className="typography-meta mt-1 text-muted-foreground">{t("webmcp.settings.servers.description")}</dd>
        </div>
        <div className="surface-inset p-4">
          <dt className="typography-ui-label font-medium text-foreground">{t("webmcp.settings.browser.title")}</dt>
          <dd className="typography-meta mt-1 text-muted-foreground">{t("webmcp.settings.browser.description")}</dd>
        </div>
      </dl>

      <ol className="typography-meta mt-6 list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>{t("webmcp.settings.steps.open")}</li>
        <li>{t("webmcp.settings.steps.enable")}</li>
        <li>{t("webmcp.settings.steps.approve")}</li>
      </ol>
    </div>
  )
}
