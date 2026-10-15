import { describe, expect, test } from "vitest"

import { layoutWikiGraph, type LayoutEdge, type LayoutPoint } from "./layout"

function distance(points: Map<string, LayoutPoint>, from: string, to: string): number {
  const left = points.get(from)
  const right = points.get(to)
  if (!left || !right) throw new Error(`missing point ${from} or ${to}`)
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

describe("layoutWikiGraph", () => {
  test("is deterministic and ignores input order", () => {
    const nodes = [{ id: "b" }, { id: "a" }, { id: "c" }, { id: "a" }]
    const edges: LayoutEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "b" },
      { from: "missing", to: "a" },
      { from: "c", to: "c" },
    ]
    const first = layoutWikiGraph(nodes, edges)
    const second = layoutWikiGraph(nodes, edges)
    const reversed = layoutWikiGraph([...nodes].reverse(), [...edges].reverse())

    expect(second).toEqual(first)
    expect(reversed).toEqual(first)
    expect(first.map((point) => point.id)).toEqual(["a", "b", "c"])
    expect(first.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })

  test("places connected nodes closer than distant ones", () => {
    const groupA = ["a0", "a1", "a2", "a3", "a4", "a5"]
    const groupB = ["b0", "b1", "b2", "b3", "b4", "b5"]
    const nodes = [...groupA, ...groupB].map((id) => ({ id }))
    const edges: LayoutEdge[] = []
    for (const group of [groupA, groupB]) {
      for (let from = 0; from < group.length; from += 1) {
        for (let to = from + 1; to < group.length; to += 1) {
          edges.push({ from: group[from], to: group[to] })
        }
      }
    }
    edges.push({ from: "a0", to: "b0" })

    const points = new Map(layoutWikiGraph(nodes, edges).map((point) => [point.id, point]))
    const intra: number[] = []
    const inter: number[] = []
    for (const group of [groupA, groupB]) {
      for (let from = 0; from < group.length; from += 1) {
        for (let to = from + 1; to < group.length; to += 1) {
          intra.push(distance(points, group[from], group[to]))
        }
      }
    }
    for (const left of groupA) {
      for (const right of groupB) {
        if (left === "a0" && right === "b0") continue
        inter.push(distance(points, left, right))
      }
    }

    expect(mean(intra)).toBeLessThan(mean(inter))
  })

  test("keeps chain neighbours closer than nodes ten hops away", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `c${String(index).padStart(2, "0")}`)
    const edges = ids.slice(0, -1).map((id, index) => ({ from: id, to: ids[index + 1] }))
    const points = new Map(
      layoutWikiGraph(
        ids.map((id) => ({ id })),
        edges,
      ).map((point) => [point.id, point]),
    )
    const adjacent = mean(ids.slice(0, -1).map((id, index) => distance(points, id, ids[index + 1])))
    const distant = mean([
      distance(points, ids[0], ids[10]),
      distance(points, ids[1], ids[11]),
      distance(points, ids[0], ids[11]),
    ])
    expect(adjacent).toBeLessThan(distant)
  })

  test("lays out 500 nodes quickly", () => {
    const count = 500
    const nodes = Array.from({ length: count }, (_, index) => ({ id: `n${String(index).padStart(4, "0")}` }))
    const edges: LayoutEdge[] = []
    for (let index = 0; index < count; index += 1) {
      edges.push({ from: nodes[index].id, to: nodes[(index + 1) % count].id })
      edges.push({ from: nodes[index].id, to: nodes[(index + 17) % count].id })
    }
    const started = performance.now()
    const points = layoutWikiGraph(nodes, edges)
    const elapsed = performance.now() - started
    expect(points).toHaveLength(count)
    expect(elapsed).toBeLessThan(100)
  })
})
