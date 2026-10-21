import { beforeEach, expect, test } from "vitest"
import { useUIStore } from "./useUIStore"
import { getSafeSessionStorage } from "./utils/safeStorage"
import { emptySessionGrid } from "@/lib/supervision/sessionGrid"

beforeEach(() => {
  getSafeSessionStorage().removeItem("openchamber.session-grid.v1")
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
