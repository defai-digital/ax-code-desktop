import React from "react"
import type { McpStatus } from "@defai-digital/ax-code-sdk/v2"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useMcpConfigStore } from "@/stores/useMcpConfigStore"
import { useMcpStore } from "@/stores/useMcpStore"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"

const statusTooltip = (
  status: McpStatus | undefined,
  t: (
    key:
      | "mcpDropdown.status.unknown"
      | "mcpDropdown.status.connected"
      | "mcpDropdown.status.failed"
      | "mcpDropdown.status.unknownError"
      | "mcpDropdown.status.needsAuth"
      | "mcpDropdown.status.needsRegistration",
    params?: { error?: string },
  ) => string,
): string => {
  if (!status) return t("mcpDropdown.status.unknown")
  switch (status.status) {
    case "connected":
      return t("mcpDropdown.status.connected")
    case "failed":
      return t("mcpDropdown.status.failed", {
        error: (status as { error?: string }).error || t("mcpDropdown.status.unknownError"),
      })
    case "needs_auth":
      return t("mcpDropdown.status.needsAuth")
    case "needs_client_registration":
      return t("mcpDropdown.status.needsRegistration", { error: (status as { error?: string }).error || "" })
    default:
      return status.status
  }
}

const statusTone = (status: McpStatus | undefined): "default" | "success" | "warning" | "error" => {
  switch (status?.status) {
    case "connected":
      return "success"
    case "failed":
      return "error"
    case "needs_auth":
    case "needs_client_registration":
      return "warning"
    default:
      return "default"
  }
}

interface McpDropdownContentProps {
  active: boolean
  className?: string
}

export const McpDropdownContent: React.FC<McpDropdownContentProps> = ({ active, className }) => {
  const { t } = useI18n()
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  const directory = currentDirectory ?? null
  const status = useMcpStore((state) => state.getStatusForDirectory(directory))
  const refresh = useMcpStore((state) => state.refresh)
  const connect = useMcpStore((state) => state.connect)
  const disconnect = useMcpStore((state) => state.disconnect)
  const mcpServers = useMcpConfigStore((state) => state.mcpServers)
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs)
  const [isSpinning, setIsSpinning] = React.useState(false)
  const [busyName, setBusyName] = React.useState<string | null>(null)

  React.useEffect(() => {
    void refresh({ directory, silent: true })
  }, [refresh, directory])

  React.useEffect(() => {
    void loadMcpConfigs({ force: true })
  }, [loadMcpConfigs])

  React.useEffect(() => {
    if (!active) return
    void Promise.all([refresh({ directory, silent: true }), loadMcpConfigs({ force: true })])
  }, [active, refresh, directory, loadMcpConfigs])

  const sortedNames = React.useMemo(() => {
    const names = new Set<string>(Object.keys(status))
    for (const server of mcpServers) {
      if (server?.name) {
        names.add(server.name)
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [mcpServers, status])

  const handleRefresh = React.useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault()
      if (isSpinning) return
      setIsSpinning(true)
      const minSpinPromise = new Promise((resolve) => setTimeout(resolve, 500))
      Promise.all([refresh({ directory }), minSpinPromise]).finally(() => {
        setIsSpinning(false)
      })
    },
    [isSpinning, refresh, directory],
  )

  return (
    <div className={cn("w-full", className)}>
      <div className="border-b border-[var(--interactive-border)]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0 flex items-baseline gap-2">
            <div className="typography-ui-header font-semibold text-foreground">{t("mcpDropdown.title")}</div>
            {directory && (
              <div className="truncate typography-micro text-muted-foreground">
                {directory.split("/").pop() || directory}
              </div>
            )}
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            disabled={isSpinning}
            onClick={handleRefresh}
            aria-label={t("mcpDropdown.actions.refreshAria")}
          >
            <Icon name="refresh" className={cn("h-4 w-4", isSpinning && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto py-2">
        {sortedNames.map((serverName) => {
          const serverStatus = status[serverName]
          const tone = statusTone(serverStatus)
          const isConnected = serverStatus?.status === "connected"
          const isBusy = busyName === serverName
          const tooltip = statusTooltip(serverStatus, t)

          return (
            <div
              key={serverName}
              className="flex items-center justify-between gap-2 px-4 py-1.5 rounded-lg hover:bg-interactive-hover/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          tone === "success" && "bg-status-success",
                          tone === "error" && "bg-status-error",
                          tone === "warning" && "bg-status-warning",
                          tone === "default" && "bg-muted-foreground/40",
                        )}
                        aria-label={tooltip}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="typography-ui-label truncate">{serverName}</span>
                </div>
              </div>

              <Switch
                checked={isConnected}
                disabled={isBusy}
                className="data-[checked]:bg-status-info"
                onCheckedChange={async (checked) => {
                  setBusyName(serverName)
                  try {
                    if (checked) {
                      await connect(serverName, directory)
                    } else {
                      await disconnect(serverName, directory)
                    }
                  } finally {
                    setBusyName(null)
                  }
                }}
              />
            </div>
          )
        })}

        {sortedNames.length === 0 && (
          <div className="px-4 py-5 typography-ui-label text-muted-foreground text-center">
            {t("mcpDropdown.empty.configureInConfig")}
          </div>
        )}
      </div>
    </div>
  )
}
