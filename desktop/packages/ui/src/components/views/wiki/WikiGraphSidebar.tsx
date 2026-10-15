import React from "react"

import { Button } from "@/components/ui/button"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import { planWikiFileOpen } from "@/lib/wiki/openPath"
import type { WikiGraphNode } from "@/lib/wiki/graph"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/useUIStore"

import { WIKI_FRESHNESS_KEY, WIKI_NODE_KIND_KEY, WIKI_PROVENANCE_KEY } from "./labels"

interface WikiGraphSidebarProps {
  directory: string
  nodes: readonly WikiGraphNode[]
  listKey: string
  selected: WikiGraphNode | null
  onSelect: (id: string) => void
}

export const WikiGraphSidebar: React.FC<WikiGraphSidebarProps> = ({
  directory,
  nodes,
  listKey,
  selected,
  onSelect,
}) => {
  const { t } = useI18n()
  const listRef = React.useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = React.useState({ listKey, index: 0 })
  // A new snapshot can shrink the list under the same key; keep the cursor on a real option.
  const activeIndex = cursor.listKey === listKey ? Math.max(0, Math.min(cursor.index, nodes.length - 1)) : 0
  const setActiveIndex = (index: number) => setCursor({ listKey, index })
  const [copiedFor, setCopiedFor] = React.useState<string | null>(null)
  const isMobile = useUIStore((state) => state.isMobile)
  const activeMainTab = useUIStore((state) => state.activeMainTab)
  const splitPaneEnabled = useUIStore((state) => state.splitPaneEnabled)
  const splitPaneRightTab = useUIStore((state) => state.splitPaneRightTab)

  const move = (next: number) => {
    if (nodes.length === 0) return
    const clamped = Math.max(0, Math.min(nodes.length - 1, next))
    setActiveIndex(clamped)
    listRef.current?.querySelector(`[data-wiki-option="${clamped}"]`)?.scrollIntoView({ block: "nearest" })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        move(activeIndex + 1)
        return
      case "ArrowUp":
        event.preventDefault()
        move(activeIndex - 1)
        return
      case "Home":
        event.preventDefault()
        move(0)
        return
      case "End":
        event.preventDefault()
        move(nodes.length - 1)
        return
      case "Enter":
        event.preventDefault()
        if (nodes[activeIndex]) onSelect(nodes[activeIndex].id)
        return
      default:
        return
    }
  }

  const openPlan = selected
    ? planWikiFileOpen({
        path: selected.path,
        directory,
        isMobile,
        activeMainTab,
        splitPaneEnabled,
        splitPaneRightTab,
      })
    : null

  const openNode = async () => {
    if (!selected) return
    const ui = useUIStore.getState()
    const plan = planWikiFileOpen({
      path: selected.path,
      directory,
      isMobile: ui.isMobile,
      activeMainTab: ui.activeMainTab,
      splitPaneEnabled: ui.splitPaneEnabled,
      splitPaneRightTab: ui.splitPaneRightTab,
    })
    if (plan.action === "copy") {
      const copied = await copyTextToClipboard(plan.path)
      if (copied.ok) setCopiedFor(selected.id)
      return
    }
    if (plan.action === "open-files") {
      ui.openContextFile(plan.directory, plan.path)
      openBesideChat("files")
    }
  }

  return (
    <div className="flex h-full min-h-0 w-[min(16rem,42%)] shrink-0 flex-col border-l border-border/40">
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={t("wiki.graph.results")}
        aria-activedescendant={nodes.length > 0 ? `wiki-graph-option-${activeIndex}` : undefined}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--interactive-focus-ring)]"
      >
        {nodes.length === 0 ? (
          <p className="px-2 py-3 typography-micro text-muted-foreground">{t("wiki.graph.noResults")}</p>
        ) : (
          nodes.map((node, index) => (
            <div
              key={node.id}
              id={`wiki-graph-option-${index}`}
              role="option"
              data-wiki-option={index}
              aria-selected={node.id === selected?.id}
              onClick={() => {
                setActiveIndex(index)
                onSelect(node.id)
              }}
              className={cn(
                "cursor-pointer truncate px-2 py-1 typography-micro text-muted-foreground",
                index === activeIndex && "bg-[var(--interactive-hover)]",
                node.id === selected?.id && "font-medium text-foreground",
              )}
            >
              {node.label || node.id}
            </div>
          ))
        )}
      </div>
      {selected ? (
        <div
          className="max-h-[55%] space-y-2 overflow-y-auto border-t border-border/40 p-2"
          aria-label={t("wiki.graph.detail")}
        >
          <h3 className="typography-ui-label text-foreground">{selected.label || selected.id}</h3>
          <dl className="space-y-1.5 typography-micro">
            <div>
              <dt className="text-muted-foreground">{t("wiki.graph.kind")}</dt>
              <dd className="text-foreground">{t(WIKI_NODE_KIND_KEY[selected.kind])}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("wiki.graph.freshness")}</dt>
              <dd className="text-foreground">{t(WIKI_FRESHNESS_KEY[selected.freshness])}</dd>
            </div>
            {selected.path.trim() ? (
              <div>
                <dt className="text-muted-foreground">{t("wiki.graph.path")}</dt>
                <dd className="break-all font-mono text-foreground">{selected.path}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">{t("wiki.graph.summary")}</dt>
              <dd className="whitespace-pre-wrap break-words text-foreground">
                {selected.summary.trim() ? selected.summary : t("wiki.graph.noSummary")}
              </dd>
            </div>
            {selected.symbols.length > 0 ? (
              <div>
                <dt className="text-muted-foreground">{t("wiki.graph.kind.symbol")}</dt>
                <dd>
                  <ul className="space-y-0.5">
                    {selected.symbols.map((symbol, index) => (
                      <li key={`${symbol.name}-${index}`} className="text-foreground">
                        {symbol.name}
                        <span className="text-muted-foreground"> · {t(WIKI_PROVENANCE_KEY[symbol.provenance])}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            <div className="text-foreground">{t("wiki.graph.references", { count: selected.recordedReferences })}</div>
          </dl>
          {openPlan && openPlan.action !== "none" ? (
            <Button variant="outline" size="xs" onClick={() => void openNode()}>
              {copiedFor === selected.id
                ? t("wiki.graph.copied")
                : openPlan.action === "copy"
                  ? t("wiki.graph.copyPath")
                  : t("wiki.graph.openFile")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
