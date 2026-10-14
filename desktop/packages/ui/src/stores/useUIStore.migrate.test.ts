import { describe, expect, test } from "vitest"

import { useUIStore } from "./useUIStore"

const migrate = (state: Record<string, unknown>, version: number) => {
  const run = useUIStore.persist.getOptions().migrate
  if (!run) throw new Error("ui-store has no migrate")
  return run({ ...state }, version) as Record<string, unknown>
}

describe("useUIStore persisted state migration", () => {
  test("reads a retired sorted chat mode as collapsed Activity", () => {
    const migrated = migrate({ chatRenderMode: "sorted", activityRenderMode: "summary" }, 13)

    expect(migrated.activityRenderMode).toBe("collapsed")
    expect(migrated).not.toHaveProperty("chatRenderMode")
  })

  test("keeps the Activity mode of a live reader", () => {
    const migrated = migrate({ chatRenderMode: "live", activityRenderMode: "summary" }, 13)

    expect(migrated.activityRenderMode).toBe("summary")
    expect(migrated).not.toHaveProperty("chatRenderMode")
  })
})
