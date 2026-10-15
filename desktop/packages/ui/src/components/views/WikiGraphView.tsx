import React from "react"
import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useI18n } from "@/lib/i18n"
import { countKinds, edgesAmong, selectVisibleNodes, WIKI_NODE_KINDS, type WikiNodeKind } from "@/lib/wiki/graph"
import { layoutWikiGraph } from "@/lib/wiki/layout"
import { isWikiMaintenanceActive, omittedTotal } from "@/lib/wiki/snapshot"
import { cn } from "@/lib/utils"

import { WikiGraphCanvas } from "./wiki/WikiGraphCanvas"
import { WikiGraphSidebar } from "./wiki/WikiGraphSidebar"
import { WIKI_FRESHNESS_KEY, WIKI_KIND_COLOR, WIKI_KIND_KEY } from "./wiki/labels"
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
  const [query, setQuery] = React.useState("")
  const [kinds, setKinds] = React.useState<Record<WikiNodeKind, boolean>>({
    page: true,
    source: true,
    symbol: true,
  })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<"build" | "refresh" | null>(null)

  const kindSet = React.useMemo(() => {
    const next = new Set<WikiNodeKind>()
    for (const kind of WIKI_NODE_KINDS) {
      if (kinds[kind]) next.add(kind)
    }
    return next
  }, [kinds])

  const graph = load?.status === "graph" ? load.graph : null
  const visibleNodes = React.useMemo(
    () => (graph ? selectVisibleNodes(graph.nodes, kindSet, query) : []),
    [graph, kindSet, query],
  )
  const visibleIds = React.useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleEdges = React.useMemo(() => (graph ? edgesAmong(graph.edges, visibleIds) : []), [graph, visibleIds])
  const positions = React.useMemo(() => (graph ? layoutWikiGraph(graph.nodes, graph.edges) : []), [graph])
  const visiblePositions = React.useMemo(
    () => positions.filter((point) => visibleIds.has(point.id)),
    [positions, visibleIds],
  )
  const counts = React.useMemo(() => countKinds(graph?.nodes ?? []), [graph])
  const selected = visibleNodes.find((node) => node.id === selectedId) ?? null

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

  const hidden = omittedTotal(graph.omitted)
  const graphLabel = selected
    ? t("wiki.graph.graphLabelSelected", { count: visibleNodes.length, label: selected.label || selected.id })
    : t("wiki.graph.graphLabel", { count: visibleNodes.length })

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("wiki.graph.searchPlaceholder")}
          aria-label={t("wiki.graph.searchPlaceholder")}
          className="h-7 w-40 typography-micro"
        />
        {WIKI_NODE_KINDS.map((kind) => (
          <Button
            key={kind}
            variant="chip"
            size="xs"
            aria-pressed={kinds[kind]}
            onClick={() => setKinds((current) => ({ ...current, [kind]: !current[kind] }))}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: WIKI_KIND_COLOR[kind] }} />
            {t(WIKI_KIND_KEY[kind])} {counts[kind]}
          </Button>
        ))}
        <div
          className="flex items-center gap-2 typography-micro text-muted-foreground"
          aria-label={t("wiki.graph.freshness")}
        >
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
            {t(WIKI_FRESHNESS_KEY.fresh)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full border border-dashed border-foreground opacity-60" />
            {t(WIKI_FRESHNESS_KEY.stale)}
          </span>
          <span className="inline-flex items-center gap-1 opacity-70">
            <span className="inline-block h-2 w-2 rounded-full bg-foreground opacity-50" />
            {t(WIKI_FRESHNESS_KEY.unknown)}
          </span>
        </div>
        {hidden > 0 ? (
          <span className="typography-micro text-muted-foreground">{t("wiki.graph.hidden", { count: hidden })}</span>
        ) : null}
        <span className="max-w-40 truncate typography-micro text-muted-foreground" title={graph.snapshot}>
          {t("wiki.graph.snapshot", { snapshot: graph.snapshot })}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          disabled={refreshing}
          onClick={() => void runRefresh("refresh")}
        >
          <Icon name="refresh" className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {t("wiki.graph.refresh")}
        </Button>
      </div>
      {actionError ? (
        <p className="border-b border-border/40 px-2 py-1 typography-micro text-[var(--status-warning)]">
          {t("wiki.graph.refreshFailed")}
        </p>
      ) : null}
      <MaintenanceBanner status={maintenance} />
      <div className="flex min-h-0 flex-1">
        <WikiGraphCanvas
          snapshot={graph.snapshot}
          nodes={visibleNodes}
          edges={visibleEdges}
          positions={positions}
          fitPositions={visiblePositions}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          label={graphLabel}
        />
        <WikiGraphSidebar
          directory={directory}
          nodes={visibleNodes}
          listKey={`${query}|${WIKI_NODE_KINDS.filter((kind) => kinds[kind]).join(",")}`}
          selected={selected}
          onSelect={setSelectedId}
        />
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
