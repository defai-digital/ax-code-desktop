import React from "react"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"

import { Button } from "@/components/ui/button"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useI18n } from "@/lib/i18n"
import { invokeDesktop } from "@/lib/desktop"
import { isWikiMaintenanceActive } from "@/lib/wiki/snapshot"

import { useWikiGraph } from "./wiki/useWikiGraph"

const PHASE_KEY = {
  queued: "wiki.graph.phase.queued",
  running: "wiki.graph.phase.running",
  failed: "wiki.graph.phase.failed",
} as const

function MaintenanceBanner({ status }: { status: WikiMaintenanceStatus | null }) {
  const { t } = useI18n()
  if (!status || (status.phase !== "queued" && status.phase !== "running" && status.phase !== "failed")) return null
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1 typography-micro text-muted-foreground">
      <span>{t(PHASE_KEY[status.phase])}</span>
      {isWikiMaintenanceActive(status) && status.total > 0 ? (
        <span>{t("wiki.graph.progress", { completed: status.completed, total: status.total })}</span>
      ) : null}
    </div>
  )
}

const WikiGraphPanel: React.FC<{ directory: string }> = ({ directory }) => {
  const { t } = useI18n()
  const { load, maintenance, refreshing, requestRefresh } = useWikiGraph(directory)
  const [actionError, setActionError] = React.useState<"build" | "refresh" | "viewer" | null>(null)
  const [opening, setOpening] = React.useState(false)
  const graph = load?.status === "graph" ? load.graph : null
  const openViewer = async () => {
    setOpening(true)
    setActionError(null)
    try {
      const result = await invokeDesktop<{ opened: boolean }>("desktop_open_wiki_viewer", { directory })
      if (!result?.opened) setActionError("viewer")
    } catch {
      setActionError("viewer")
    } finally {
      setOpening(false)
    }
  }

  const runRefresh = async (source: "build" | "refresh") => {
    setActionError(null)
    const ok = await requestRefresh()
    if (!ok) setActionError(source)
  }

  if (load === null) {
    return (
      <div className="flex h-full items-center justify-center p-6" aria-busy="true">
        <p className="typography-ui-label text-muted-foreground">{t("wiki.graph.loading")}</p>
      </div>
    )
  }

  if (!graph) {
    const message =
      load.status === "missing"
        ? t("wiki.graph.emptyBody")
        : load.status === "too_large"
          ? t("wiki.graph.tooLarge")
          : t("wiki.graph.error")
    return (
      <div className="flex h-full flex-col">
        <MaintenanceBanner status={maintenance} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {load.status === "missing" ? (
            <h2 className="typography-ui-label text-foreground">{t("wiki.graph.emptyTitle")}</h2>
          ) : null}
          <p className="max-w-sm typography-micro text-muted-foreground">{message}</p>
          {actionError ? (
            <p className="typography-micro text-[var(--status-warning)]">
              {actionError === "build" ? t("wiki.graph.buildFailed") : t("wiki.graph.refreshFailed")}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void runRefresh(load.status === "missing" ? "build" : "refresh")}
          >
            {load.status === "missing" ? t("wiki.graph.build") : t("wiki.graph.refresh")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <MaintenanceBanner status={maintenance} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h2 className="typography-ui-label">{t("wiki.graph.title")}</h2>
        <p className="max-w-sm typography-micro text-muted-foreground">{t("wiki.graph.viewerDescription")}</p>
        <Button disabled={opening} onClick={() => void openViewer()}>
          {t("wiki.graph.openViewer")}
        </Button>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void runRefresh("refresh")}>
          {t("wiki.graph.refresh")}
        </Button>
        {actionError ? (
          <p role="alert" className="typography-micro text-[var(--status-warning)]">
            {t(actionError === "viewer" ? "wiki.graph.viewerFailed" : "wiki.graph.refreshFailed")}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export const WikiGraphView: React.FC = () => {
  const { t } = useI18n()
  const directory = useEffectiveDirectory()
  if (!directory) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6 text-center">
        <p className="typography-ui-label text-muted-foreground">{t("wiki.graph.noDirectory")}</p>
      </div>
    )
  }
  return <WikiGraphPanel key={directory} directory={directory} />
}
