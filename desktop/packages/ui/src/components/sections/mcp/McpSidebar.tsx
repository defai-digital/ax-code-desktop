import React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useMcpConfigStore, type McpDraft, type McpServerConfig } from "@/stores/useMcpConfigStore"
import { useShallow } from "zustand/react/shallow"
import { useMcpStore } from "@/stores/useMcpStore"
import { useUIStore } from "@/stores/useUIStore"
import { useActiveConfigDirectory } from "@/hooks/useActiveConfigDirectory"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui"
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { SettingsProjectSelector } from "@/components/sections/shared/SettingsProjectSelector"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { WebMcpStatusDot } from "@/components/mcp/WebMcpBrowserTools"
import { useWebMcpSummary } from "@/hooks/useWebMcpBrowser"
import { runSettingsDeleteMutation } from "../settingsDeleteMutation"

interface McpSidebarProps {
  onItemSelect?: () => void
}

// ---- Status dot ----
type McpStatusTone = "success" | "error" | "warning" | "idle"

const statusToneFromMcp = (status: string | undefined): McpStatusTone => {
  switch (status) {
    case "connected":
      return "success"
    case "failed":
      return "error"
    case "needs_auth":
    case "needs_client_registration":
      return "warning"
    default:
      return "idle"
  }
}

const StatusDot: React.FC<{ tone: McpStatusTone; enabled: boolean }> = ({ tone, enabled }) => {
  if (!enabled) {
    return <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30 flex-shrink-0" />
  }
  const classes: Record<McpStatusTone, string> = {
    success: "bg-[var(--status-success)]",
    error: "bg-[var(--status-error)]",
    warning: "bg-[var(--status-warning)]",
    idle: "bg-muted-foreground/40",
  }
  return <span className={cn("inline-block h-2 w-2 rounded-full flex-shrink-0", classes[tone])} />
}

export const McpSidebar: React.FC<McpSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n()
  const bgClass = "bg-background"
  // Reactive, not the --is-mobile CSS variable: React Compiler caches a bare CSS read
  // with no dependencies, which froze long-press behavior at the mount-time breakpoint.
  const isMobile = useUIStore((state) => state.isMobile)

  const { mcpServers, loadedDirectory, isLoading, selectedMcpName, selectionRevision, mcpDraft, setSelectedMcp, refreshSelectedMcp, setMcpDraft, loadMcpConfigs, deleteMcp } = useMcpConfigStore(
    useShallow((s) => ({
      mcpServers: s.mcpServers,
      loadedDirectory: s.loadedDirectory,
      isLoading: s.isLoading,
      selectedMcpName: s.selectedMcpName,
      selectionRevision: s.selectionRevision,
      mcpDraft: s.mcpDraft,
      setSelectedMcp: s.setSelectedMcp,
      refreshSelectedMcp: s.refreshSelectedMcp,
      setMcpDraft: s.setMcpDraft,
      loadMcpConfigs: s.loadMcpConfigs,
      deleteMcp: s.deleteMcp,
    })),
  )

  const currentDirectory = useActiveConfigDirectory()
  const inventoryMatchesDirectory = loadedDirectory === (currentDirectory ?? null)
  const mcpStatus = useMcpStore((state) => state.getStatusForDirectory(currentDirectory ?? null))
  const refreshStatus = useMcpStore((state) => state.refresh)
  const getErrorForDirectory = useMcpStore((state) => state.getErrorForDirectory)

  const webMcpSummary = useWebMcpSummary()
  const settingsCardSelected = useWebMcpBrowserStore((state) => state.settingsCardSelected)
  const setSettingsCardSelected = useWebMcpBrowserStore((state) => state.setSettingsCardSelected)
  // Leaving the MCP page (or closing Settings) returns the selection to its default.
  React.useEffect(() => () => setSettingsCardSelected(false), [setSettingsCardSelected])
  const selectBrowserTools = React.useCallback(() => {
    setSelectedMcp(null)
    setMcpDraft(null)
    setSettingsCardSelected(true)
    onItemSelect?.()
  }, [onItemSelect, setMcpDraft, setSelectedMcp, setSettingsCardSelected])
  const [deleteTarget, setDeleteTarget] = React.useState<McpServerConfig | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [openMenuMcp, setOpenMenuMcp] = React.useState<string | null>(null)
  const [isRefreshingStatus, setIsRefreshingStatus] = React.useState(false)
  const contextGenerationRef = React.useRef(0)
  const refreshGenerationRef = React.useRef(0)
  React.useLayoutEffect(() => {
    contextGenerationRef.current += 1
    setDeleteTarget(null)
    setOpenMenuMcp(null)
    setIsDeleting(false)
    return () => { contextGenerationRef.current += 1 }
  }, [currentDirectory, selectedMcpName, mcpDraft, selectionRevision])
  React.useLayoutEffect(() => {
    refreshGenerationRef.current += 1
    setIsRefreshingStatus(false)
    return () => { refreshGenerationRef.current += 1 }
  }, [currentDirectory])

  const projectServers = React.useMemo(() => mcpServers.filter((server) => server.scope === "project"), [mcpServers])
  const userServers = React.useMemo(() => mcpServers.filter((server) => server.scope !== "project"), [mcpServers])

  React.useEffect(() => {
    void loadMcpConfigs()
  }, [loadMcpConfigs, currentDirectory])

  const handleRefresh = React.useCallback(() => {
    if (isRefreshingStatus) return

    const generation = refreshGenerationRef.current
    setIsRefreshingStatus(true)
    const minSpinPromise = new Promise((resolve) => setTimeout(resolve, 500))

    Promise.all([refreshStatus({ directory: currentDirectory, silent: true }), minSpinPromise])
      .then(() => {
        const error = getErrorForDirectory(currentDirectory)
        if (error) {
          toast.error(error)
        }
      })
      .finally(() => {
        if (refreshGenerationRef.current === generation) setIsRefreshingStatus(false)
      })
  }, [currentDirectory, getErrorForDirectory, isRefreshingStatus, refreshStatus])

  const handleCreateNew = () => {
    if (!inventoryMatchesDirectory) return
    setSettingsCardSelected(false)
    const baseName = "new-mcp-server"
    let newName = baseName
    let counter = 1
    while (mcpServers.some((s) => s.name === newName)) {
      newName = `${baseName}-${counter}`
      counter++
    }

    const draft: McpDraft = {
      name: newName,
      scope: "user",
      type: "local",
      command: [],
      url: "",
      environment: [],
      headers: [],
      oauthEnabled: true,
      oauthClientId: "",
      oauthClientSecret: "",
      oauthScope: "",
      oauthRedirectUri: "",
      timeout: "",
      enabled: true,
    }
    setMcpDraft(draft)
    setSelectedMcp(newName)
    onItemSelect?.()
  }

  const handleDelete = async () => {
    if (!deleteTarget || !inventoryMatchesDirectory) return
    const generation = contextGenerationRef.current
    setIsDeleting(true)
    try {
      const outcome = await runSettingsDeleteMutation(() => deleteMcp(deleteTarget.name, currentDirectory ?? null, selectionRevision))
      if (outcome.status === "unexpected-error") {
        console.error("Failed to delete MCP server:", outcome.error)
        toast.error(t("settings.mcp.sidebar.toast.deleteFailed"))
        return
      }

      const result = outcome.result
      if (result.ok) {
        if (contextGenerationRef.current === generation) refreshSelectedMcp(deleteTarget.name, currentDirectory ?? null, selectionRevision)
        if (result.reloadFailed) {
          toast.warning(result.message || `MCP server "${deleteTarget.name}" deleted, but ax-code reload failed`, {
            description: result.warning || t("settings.mcp.sidebar.toast.refreshListIfStale"),
          })
        } else {
          toast.success(result.message || t("settings.mcp.sidebar.toast.serverDeleted", { name: deleteTarget.name }))
        }
      } else {
        toast.error(result.contextChanged ? t("settings.mcp.toast.projectChanged") : result.message || t("settings.mcp.sidebar.toast.deleteFailed"))
      }
      if (contextGenerationRef.current === generation) setDeleteTarget(null)
    } finally {
      if (contextGenerationRef.current === generation) setIsDeleting(false)
    }
  }

  return (
    <div className={cn("flex h-full flex-col", bgClass)}>
      <div className="border-b px-3 pt-4 pb-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{t("settings.mcp.sidebar.title")}</h2>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            disabled={isRefreshingStatus}
            onClick={handleRefresh}
            aria-label={t("settings.mcp.sidebar.actions.refreshStatusAria")}
            title={t("settings.mcp.sidebar.actions.refreshStatusTitle")}
          >
            <Icon name="refresh" className={cn("h-4 w-4", isRefreshingStatus && "animate-spin")} />
          </button>
        </div>
        <SettingsProjectSelector className="mb-3" />
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">
            {inventoryMatchesDirectory ? t("settings.mcp.sidebar.total", { count: mcpServers.length }) : t(isLoading ? "common.loading" : "common.unavailable")}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0 -my-1 text-muted-foreground"
            onClick={handleCreateNew}
            disabled={!inventoryMatchesDirectory}
            title={t("settings.mcp.sidebar.actions.addServerTitle")}
            aria-label={t("settings.mcp.sidebar.actions.addServerTitle")}
          >
            <Icon name="add" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* List */}
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        <div className="px-2 pb-1.5 pt-2 typography-micro font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings.mcp.sidebar.group.thisApp")}
        </div>
        <button
          type="button"
          onClick={selectBrowserTools}
          className={cn(
            "flex w-full min-w-0 flex-col gap-0 rounded-md px-1.5 py-1 text-left transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            settingsCardSelected && !selectedMcpName ? "bg-interactive-selection" : "hover:bg-interactive-hover",
          )}
        >
          <div className="flex items-center gap-2">
            <WebMcpStatusDot tone={webMcpSummary.tone} />
            <span className="typography-ui-label font-normal truncate text-foreground">{t("webmcp.title")}</span>
            <Icon name="ax-browser" className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          </div>
          <div className="typography-micro text-muted-foreground truncate leading-tight pl-4">
            {webMcpSummary.detail}
          </div>
        </button>
        {!inventoryMatchesDirectory ? (
          <div className="space-y-2 px-2 py-4 text-muted-foreground typography-meta" role={isLoading ? "status" : "alert"} aria-busy={isLoading}>
            <p>{t(isLoading ? "common.loading" : "settings.mcp.page.inventory.unavailable")}</p>
            {!isLoading && <Button variant="outline" size="xs" onClick={() => void loadMcpConfigs({ force: true })}>{t("settings.mcp.page.inventory.retry")}</Button>}
          </div>
        ) : mcpServers.length === 0 ? (
          <div className="py-12 px-4 text-center text-muted-foreground">
            <Icon name="plug" className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="typography-ui-label font-medium">{t("settings.mcp.sidebar.empty.title")}</p>
            <p className="typography-meta mt-1 opacity-75">{t("settings.mcp.sidebar.empty.description")}</p>
          </div>
        ) : (
          <>
            {projectServers.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-2 typography-micro font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("settings.mcp.sidebar.group.projectServers")}
                </div>
                {projectServers.map((server) => {
                  const runtimeStatus = mcpStatus[server.name]
                  const tone = statusToneFromMcp(runtimeStatus?.status)
                  const isSelected = selectedMcpName === server.name

                  return (
                    <div
                      key={server.name}
                      className={cn(
                        "group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200 select-none",
                        isSelected ? "bg-interactive-selection" : "hover:bg-interactive-hover",
                      )}
                      onContextMenu={
                        !isMobile
                          ? (e) => {
                              e.preventDefault()
                              setOpenMenuMcp(server.name)
                            }
                          : undefined
                      }
                    >
                      <button
                        onClick={() => {
                          setSelectedMcp(server.name)
                          setMcpDraft(null)
                          setSettingsCardSelected(false)
                          onItemSelect?.()
                        }}
                        className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <div className="flex items-center gap-2">
                          <StatusDot tone={tone} enabled={server.enabled} />
                          <span className="typography-ui-label font-normal truncate text-foreground">
                            {server.name}
                          </span>
                          <span
                            title={
                              server.type === "local"
                                ? t("settings.mcp.sidebar.serverType.localTitle")
                                : t("settings.mcp.sidebar.serverType.remoteTitle")
                            }
                          >
                            {server.type === "local" ? (
                              <Icon name="server" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Icon name="global" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </span>
                        </div>
                        <div className="typography-micro text-muted-foreground truncate leading-tight pl-4">
                          {server.type === "local"
                            ? ((server as { command?: string[] }).command?.join(" ") ?? "")
                            : ((server as { url?: string }).url ?? "")}
                        </div>
                      </button>

                      <DropdownMenu
                        open={openMenuMcp === server.name}
                        onOpenChange={(open) => setOpenMenuMcp(open ? server.name : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                            aria-label={t("settings.snippets.sidebar.actions.more", { name: server.name })}
                          >
                            <Icon name="more-2" className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-fit min-w-20">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(server)
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Icon name="delete-bin" className="h-4 w-4 mr-px" />
                            {t("settings.common.actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </>
            )}

            {userServers.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-2 typography-micro font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("settings.mcp.sidebar.group.userServers")}
                </div>
                {userServers.map((server) => {
                  const runtimeStatus = mcpStatus[server.name]
                  const tone = statusToneFromMcp(runtimeStatus?.status)
                  const isSelected = selectedMcpName === server.name

                  return (
                    <div
                      key={server.name}
                      className={cn(
                        "group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200 select-none",
                        isSelected ? "bg-interactive-selection" : "hover:bg-interactive-hover",
                      )}
                      onContextMenu={
                        !isMobile
                          ? (e) => {
                              e.preventDefault()
                              setOpenMenuMcp(server.name)
                            }
                          : undefined
                      }
                    >
                      <button
                        onClick={() => {
                          setSelectedMcp(server.name)
                          setMcpDraft(null)
                          setSettingsCardSelected(false)
                          onItemSelect?.()
                        }}
                        className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <div className="flex items-center gap-2">
                          <StatusDot tone={tone} enabled={server.enabled} />
                          <span className="typography-ui-label font-normal truncate text-foreground">
                            {server.name}
                          </span>
                          <span
                            title={
                              server.type === "local"
                                ? t("settings.mcp.sidebar.serverType.localTitle")
                                : t("settings.mcp.sidebar.serverType.remoteTitle")
                            }
                          >
                            {server.type === "local" ? (
                              <Icon name="server" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Icon name="global" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </span>
                        </div>
                        <div className="typography-micro text-muted-foreground truncate leading-tight pl-4">
                          {server.type === "local"
                            ? ((server as { command?: string[] }).command?.join(" ") ?? "")
                            : ((server as { url?: string }).url ?? "")}
                        </div>
                      </button>

                      <DropdownMenu
                        open={openMenuMcp === server.name}
                        onOpenChange={(open) => setOpenMenuMcp(open ? server.name : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                            aria-label={t("settings.snippets.sidebar.actions.more", { name: server.name })}
                          >
                            <Icon name="more-2" className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-fit min-w-20">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(server)
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Icon name="delete-bin" className="h-4 w-4 mr-px" />
                            {t("settings.common.actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </ScrollableOverlay>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.mcp.sidebar.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("settings.mcp.sidebar.deleteDialog.descriptionPrefix", { name: deleteTarget?.name || "" })}{" "}
              <code className="text-foreground">ax-code.json</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {t("settings.common.actions.cancel")}
            </Button>
            <Button size="sm" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t("settings.mcp.sidebar.actions.deleting") : t("settings.common.actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Re-export for easy sidebar icon usage

import { Icon } from "@/components/icon/Icon"
