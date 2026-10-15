import { describe, expect, test } from "vitest"
import { buildJsonTree, parseJsonToTree, flattenTree, getAllExpandableIds } from "./jsonTreeUtils"

describe("JSON tree construction", () => {
  test("builds the same paths and values directly from parsed JSON", () => {
    const data = { rows: [{ name: "fixture", active: true, size: 12, optional: null }], empty: {} }
    const tree = buildJsonTree(data)!
    expect(tree).toEqual(parseJsonToTree(JSON.stringify(data)))
    expect(tree.value).toBe(data)
    expect(tree.children?.[0].value).toBe(data.rows)
    expect(flattenTree(tree, new Set()).map(({ node }) => node.id)).toEqual([
      "root", "root.rows", "root.rows[0]", "root.rows[0].name", "root.rows[0].active",
      "root.rows[0].size", "root.rows[0].optional", "root.empty",
    ])
    expect(getAllExpandableIds(tree)).toContain("root.empty")
  })

  test("gives every node a unique id even when a key contains the path separators", () => {
    // A key like "cfg.mode" used to produce the same id as a nested cfg → mode, so
    // one collapse toggled both rows.
    const tree = buildJsonTree({ "cfg.mode": { deep: 1 }, cfg: { mode: { deep: 2 } } })!
    const ids = flattenTree(tree, new Set()).map(({ node }) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      "root",
      "root.cfg\\.mode",
      "root.cfg\\.mode.deep",
      "root.cfg",
      "root.cfg.mode",
      "root.cfg.mode.deep",
    ])

    // Collapsing the escaped key leaves the nested node's children visible.
    const collapsed = flattenTree(tree, new Set(["root.cfg\\.mode"])).map(({ node }) => node.id)
    expect(collapsed).toContain("root.cfg.mode.deep")

    const arrayLike = buildJsonTree({ "a[1]": "keyed", a: [10, 20] })!
    const arrayIds = flattenTree(arrayLike, new Set()).map(({ node }) => node.id)
    expect(new Set(arrayIds).size).toBe(arrayIds.length)
  })

  test("does not read array entries beyond the node budget", () => {
    let reads = 0
    const data = new Proxy(Array.from({ length: 1000 }, (_, index) => index), {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads++
        return Reflect.get(target, key, receiver)
      },
    })
    const tree = buildJsonTree(data, { maxNodes: 4 })!
    expect(tree.childCount).toBe(1000)
    expect(tree.children?.map((node) => node.value)).toEqual([0, 1, 2])
    expect(reads).toBe(3)
  })

  test("keeps depth limits, including counts on unexpanded containers", () => {
    const tree = buildJsonTree({ rows: [1, 2, 3] }, { maxDepth: 1 })!
    expect(tree.children?.[0].childCount).toBe(3)
    expect(tree.children?.[0].children).toBeUndefined()
    expect(buildJsonTree([1], { maxNodes: 0 })).toBeNull()
  })

  test("does not share node budgets across reentrant calls", () => {
    const data = { get value() { buildJsonTree([1, 2, 3]); return 7 } }
    expect(buildJsonTree(data, { maxNodes: 2 })?.children?.[0].value).toBe(7)
  })

  test("handles invalid text and cycles while allowing shared subtrees", () => {
    expect(parseJsonToTree("invalid")).toBeNull()
    expect(parseJsonToTree(" ")).toBeNull()
    expect(parseJsonToTree("null")?.type).toBe("null")
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(buildJsonTree(cyclic)).toBeNull()
    const shared = { value: 1 }
    expect(buildJsonTree([shared, shared])?.children).toHaveLength(2)
  })
})
