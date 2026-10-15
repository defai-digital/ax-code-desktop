import { describe, expect, test } from "vitest"

import { classifyWikiVisualization, isWikiMaintenanceActive, mergeWikiLoad, omittedTotal } from "./snapshot"

const graph = {
  schemaVersion: 1 as const,
  snapshot: "snap-1",
  scope: "wiki-manifest" as const,
  codeRelationships: "unavailable" as const,
  nodes: [],
  edges: [],
  omitted: { nodes: 2, edges: 3 },
}

describe("classifyWikiVisualization", () => {
  test("accepts a graph and classifies the known unavailable codes", () => {
    expect(classifyWikiVisualization({ data: graph }).status).toBe("graph")
    expect(classifyWikiVisualization({ error: { name: "WikiVisualizationUnavailable", code: "missing" } })).toEqual({
      status: "missing",
    })
    expect(classifyWikiVisualization({ error: { name: "WikiVisualizationUnavailable", code: "too_large" } })).toEqual({
      status: "too_large",
    })
    expect(classifyWikiVisualization({ error: { name: "WikiVisualizationUnavailable", code: "invalid" } })).toEqual({
      status: "error",
    })
    expect(classifyWikiVisualization({ error: new Error("offline") })).toEqual({ status: "error" })
    expect(classifyWikiVisualization(null)).toEqual({ status: "error" })
  })

  test("prefers graph data over an accompanying error", () => {
    expect(classifyWikiVisualization({ data: graph, error: { code: "missing" } }).status).toBe("graph")
  })

  test("keeps the previous graph when a silent refetch fails", () => {
    const current = { status: "graph" as const, graph }
    expect(mergeWikiLoad(current, { status: "error" }, true)).toBe(current)
    expect(mergeWikiLoad(current, { status: "missing" }, true)).toEqual({ status: "missing" })
    expect(mergeWikiLoad(null, { status: "error" }, true)).toEqual({ status: "error" })
  })

  test("detects a running maintenance phase and sums omitted counts", () => {
    expect(isWikiMaintenanceActive({ phase: "running" })).toBe(true)
    expect(isWikiMaintenanceActive({ phase: "queued" })).toBe(true)
    expect(isWikiMaintenanceActive({ phase: "ready" })).toBe(false)
    expect(isWikiMaintenanceActive(null)).toBe(false)
    expect(omittedTotal({ nodes: 2, edges: 3 })).toBe(5)
    expect(omittedTotal({ nodes: 0, edges: -1 })).toBe(0)
  })
})
