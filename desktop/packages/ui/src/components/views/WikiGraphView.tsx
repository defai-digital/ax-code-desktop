import React from "react"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"

import { Button } from "@/components/ui/button"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useI18n, type I18nKey } from "@/lib/i18n"
import { invokeDesktop } from "@/lib/desktop"
import { classifyWikiViewerResult, type WikiMaintenanceDisabledReason, type WikiViewerFailure } from "@/lib/wiki/api"
import { isWikiMaintenanceActive } from "@/lib/wiki/snapshot"

import { useWikiGraph } from "./wiki/useWikiGraph"

const PHASE_KEY = {
  queued: "wiki.graph.phase.queued",
  running: "wiki.graph.phase.running",
} as const

function disabledReasonKey(reason: WikiMaintenanceDisabledReason): I18nKey {
  if (reason === "permissions") return "wiki.graph.maintenance.permissions"
  if (reason === "non_git") return "wiki.graph.maintenance.nonGit"
  // The runtime's unattached fallback (reason "disabled") means maintenance has not
  // started, not that the project cannot maintain a wiki.
  return "wiki.graph.maintenance.disabled"
}

/** One message per banner state; a failed phase uses its actionable hint instead of a label. */
function maintenanceBannerKey(status: WikiMaintenanceStatus): I18nKey | null {
  if (status.phase === "ready") return null
  if (status.phase === "disabled") {
    if (status.reason === "permissions") return disabledReasonKey("permissions")
    if (status.reason === "non_git") return disabledReasonKey("non_git")
    return disabledReasonKey("disabled")
  }
  if (status.phase === "failed") return "wiki.graph.maintenance.failed"
  return PHASE_KEY[status.phase]
}

function MaintenanceBanner({ status }: { status: WikiMaintenanceStatus | null }) {
  const { t } = useI18n()
  const key = status ? maintenanceBannerKey(status) : null
  if (!status || !key) return null
  const active = isWikiMaintenanceActive(status)
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1 typography-micro text-muted-foreground">
      <span>{t(key)}</span>
      {active && status.total > 0 ? (
        <span>{t("wiki.graph.progress", { completed: status.completed, total: status.total })}</span>
      ) : null}
    </div>
  )
}

type ActionFailure =
  | { kind: "build" }
  | { kind: "refresh" }
  | { kind: "maintenance"; reason: WikiMaintenanceDisabledReason }
  | { kind: "viewer"; failure: WikiViewerFailure }

function viewerFailureKey(failure: WikiViewerFailure): I18nKey {
  if (failure === "runtime_unavailable") return "wiki.graph.viewerRuntimeUnavailable"
  if (failure === "wiki_missing") return "wiki.graph.viewerMissingWiki"
  if (failure === "export_incompatible") return "wiki.graph.viewerIncompatible"
  return "wiki.graph.viewerFailed"
}

function actionFailureKey(failure: ActionFailure): I18nKey {
  if (failure.kind === "build") return "wiki.graph.buildFailed"
  if (failure.kind === "refresh") return "wiki.graph.refreshFailed"
  if (failure.kind === "maintenance") return disabledReasonKey(failure.reason)
  return viewerFailureKey(failure.failure)
}

const WikiGraphPanel: React.FC<{ directory: string }> = ({ directory }) => {
  const { t } = useI18n()
  const { load, maintenance, refreshing, requestRefresh } = useWikiGraph(directory)
  const [actionError, setActionError] = React.useState<ActionFailure | null>(null)
  const [opening, setOpening] = React.useState(false)
  const graph = load?.status === "graph" ? load.graph : null
  const openViewer = async () => {
    setOpening(true)
    setActionError(null)
    try {
      const result = classifyWikiViewerResult(await invokeDesktop("desktop_open_wiki_viewer", { directory }))
      if (!result.opened) setActionError({ kind: "viewer", failure: result.failure })
    } catch {
      setActionError({ kind: "viewer", failure: "failed" })
    } finally {
      setOpening(false)
    }
  }

  const runRefresh = async (source: "build" | "refresh") => {
    setActionError(null)
    const outcome = await requestRefresh()
    if (outcome.status === "started") return
    // A disabled runtime status is not a transport failure: say why nothing was queued.
    if (outcome.status === "disabled") setActionError({ kind: "maintenance", reason: outcome.reason })
    else setActionError({ kind: source })
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
            <p className="typography-micro text-[var(--status-warning)]">{t(actionFailureKey(actionError))}</p>
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
            {t(actionFailureKey(actionError))}
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
