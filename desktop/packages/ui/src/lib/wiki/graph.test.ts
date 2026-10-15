import { describe, expect, test } from "vitest"

import { countKinds, edgesAmong, neighbourhoodOf, selectVisibleNodes, truncateLabel, type WikiGraphNode } from "./graph"

function node(partial: Partial<WikiGraphNode> & Pick<WikiGraphNode, "id" | "kind">): WikiGraphNode {
  return {
    label: partial.id,
    path: "",
    freshness: "fresh",
    recordedReferences: 0,
    summary: "",
    symbols: [],
    ...partial,
  }
}

const nodes = [
  node({ id: "page", kind: "page", label: "Overview", path: "wiki/overview.md" }),
  node({ id: "source", kind: "source", label: "Client", path: "src/client.ts" }),
  node({ id: "symbol", kind: "symbol", label: "openFile", path: "src/client.ts" }),
]

describe("wiki graph filters", () => {
  test("counts every kind on the full snapshot", () => {
    expect(countKinds(nodes)).toEqual({ page: 1, source: 1, symbol: 1, total: 3 })
  })

  test("filters by kind and searches label or path", () => {
    const pages = selectVisibleNodes(nodes, new Set(["page"]), "")
    expect(pages.map((item) => item.id)).toEqual(["page"])

    const byPath = selectVisibleNodes(nodes, new Set(["page", "source", "symbol"]), " CLIENT.TS ")
    expect(byPath.map((item) => item.id)).toEqual(["source", "symbol"])

    const byLabel = selectVisibleNodes(nodes, new Set(["page", "source", "symbol"]), "over")
    expect(byLabel.map((item) => item.id)).toEqual(["page"])

    expect(selectVisibleNodes(nodes, new Set(), "over")).toEqual([])
  })

  test("keeps edges only when both ends are visible and builds a one-hop neighbourhood", () => {
    const edges = [
      { from: "page", to: "source" },
      { from: "source", to: "symbol" },
      { from: "page", to: "missing" },
    ]
    const visible = new Set(["page", "source"])
    expect(edgesAmong(edges, visible)).toEqual([{ from: "page", to: "source" }])
    expect(neighbourhoodOf("source", edges)).toEqual(new Set(["source", "page", "symbol"]))
    expect(neighbourhoodOf("alone", [])).toEqual(new Set(["alone"]))
  })

  test("truncates labels on unicode character boundaries", () => {
    expect(truncateLabel("short")).toBe("short")
    const long = "áéíóúáéíóúáéíóúáéíóúáéíóúáéíóúáéíóú"
    const truncated = truncateLabel(long)
    expect(Array.from(long).length).toBeGreaterThan(32)
    expect(Array.from(truncated).length).toBe(32)
    expect(truncated.endsWith("…")).toBe(true)
  })
})
