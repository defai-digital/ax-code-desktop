import type { I18nKey } from "@/lib/i18n"
import type { WikiFreshness, WikiNodeKind, WikiSymbolProvenance } from "@/lib/wiki/graph"

export const WIKI_KIND_KEY: Record<WikiNodeKind, I18nKey> = {
  page: "wiki.graph.kind.page",
  source: "wiki.graph.kind.source",
  symbol: "wiki.graph.kind.symbol",
}

export const WIKI_NODE_KIND_KEY: Record<WikiNodeKind, I18nKey> = {
  page: "wiki.graph.nodeKind.page",
  source: "wiki.graph.nodeKind.source",
  symbol: "wiki.graph.nodeKind.symbol",
}

export const WIKI_FRESHNESS_KEY: Record<WikiFreshness, I18nKey> = {
  fresh: "wiki.graph.freshness.fresh",
  stale: "wiki.graph.freshness.stale",
  unknown: "wiki.graph.freshness.unknown",
}

export const WIKI_PROVENANCE_KEY: Record<WikiSymbolProvenance, I18nKey> = {
  verified: "wiki.graph.provenance.verified",
  inferred: "wiki.graph.provenance.inferred",
  unavailable: "wiki.graph.provenance.unavailable",
}

export const WIKI_KIND_COLOR: Record<WikiNodeKind, string> = {
  page: "var(--chart-1)",
  source: "var(--chart-2)",
  symbol: "var(--chart-3)",
}
