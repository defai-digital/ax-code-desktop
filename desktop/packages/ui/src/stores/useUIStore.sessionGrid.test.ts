import { beforeEach, expect, test } from "vitest"
import { useUIStore } from "./useUIStore"
import { getSafeSessionStorage, getSafeStorage } from "./utils/safeStorage"
import { emptySessionGrid, splitGridPane } from "@/lib/supervision/sessionGrid"
import { ratiosForLayout, SESSION_GRID_RATIOS_KEY } from "@/lib/supervision/sessionGridPreferences"

beforeEach(() => {
  getSafeSessionStorage().removeItem("openchamber.session-grid.v1")
  getSafeStorage().removeItem(SESSION_GRID_RATIOS_KEY)
  useUIStore.setState({ sessionGrid: emptySessionGrid() })
})

test("persists per window and restores validated data through rehydration", async () => {
  useUIStore
    .getState()
    .setSessionGrid({
      layout: 3,
      slots: [{ sessionId: "one", directory: "c:\\repo\\" }, null, null],
      ratios: { columns: 0.4, rows: 0.6 },
    })
  useUIStore.setState({ sessionGrid: emptySessionGrid() })
  await useUIStore.persist.rehydrate()
  expect(useUIStore.getState().sessionGrid).toEqual({
    layout: 3,
    slots: [{ sessionId: "one", directory: "C:/repo" }, null, null],
    ratios: { columns: 0.4, rows: 0.6 },
    tree: null,
  })
  const partialize = useUIStore.persist.getOptions().partialize!
  expect(partialize(useUIStore.getState())).not.toHaveProperty("sessionGrid")
})

test("another window's shared UI payload cannot replace the window grid", () => {
  const merge = useUIStore.persist.getOptions().merge!
  const other = { sessionGrid: { layout: 2, slots: [{ sessionId: "other", directory: "/repo" }], ratios: {} } }
  expect(merge(other, useUIStore.getState()).sessionGrid).toEqual(emptySessionGrid())
})

test("corrupt or unbounded per-window snapshots recover safely", async () => {
  getSafeSessionStorage().setItem("openchamber.session-grid.v1", "{")
  await useUIStore.persist.rehydrate()
  expect(useUIStore.getState().sessionGrid).toEqual(emptySessionGrid())
  getSafeSessionStorage().setItem(
    "openchamber.session-grid.v1",
    JSON.stringify({
      layout: 4,
      slots: Array(20).fill({ sessionId: "repeat", directory: "/repo" }),
      ratios: { columns: "bad" },
    }),
  )
  await useUIStore.persist.rehydrate()
  expect(useUIStore.getState().sessionGrid.slots).toEqual([
    { sessionId: "repeat", directory: "/repo" },
    null,
    null,
    null,
  ])
})

test("each preset layout keeps its own split across a switch and a reload", async () => {
  useUIStore.getState().setSessionGrid({
    layout: 2,
    slots: [null, null],
    ratios: { columns: 0.4, rows: 0.5 },
    tree: null,
  })
  useUIStore.getState().setSessionGrid({
    layout: 4,
    slots: [null, null, null, null],
    ratios: { columns: 0.7, rows: 0.3 },
    tree: null,
  })
  useUIStore.getState().setSessionGrid({
    layout: 2,
    slots: [null, null],
    ratios: ratiosForLayout(2) ?? { columns: 0.5, rows: 0.5 },
    tree: null,
  })
  expect(useUIStore.getState().sessionGrid.ratios.columns).toBe(0.4)
  useUIStore.setState({ sessionGrid: emptySessionGrid() })
  await useUIStore.persist.rehydrate()
  expect(useUIStore.getState().sessionGrid.layout).toBe(2)
  expect(useUIStore.getState().sessionGrid.ratios.columns).toBe(0.4)
  expect(useUIStore.getState().sessionGrid.tree).toBeNull()
})

test("a custom arrangement round-trips without replacing preset split sizes", async () => {
  useUIStore.getState().setSessionGrid({
    layout: 2,
    slots: [null, null],
    ratios: { columns: 0.4, rows: 0.5 },
    tree: null,
  })
  const custom = splitGridPane(useUIStore.getState().sessionGrid, 0, "bottom")
  expect(custom?.tree).not.toBeNull()
  useUIStore.getState().setSessionGrid(custom!)
  expect(ratiosForLayout(2)?.columns).toBe(0.4)
  expect(ratiosForLayout(3)).toBeNull()
  useUIStore.setState({ sessionGrid: emptySessionGrid() })
  await useUIStore.persist.rehydrate()
  expect(useUIStore.getState().sessionGrid.tree).not.toBeNull()
  expect(useUIStore.getState().sessionGrid.slots).toHaveLength(3)
  expect(ratiosForLayout(2)?.columns).toBe(0.4)
  expect(ratiosForLayout(3)).toBeNull()
})
