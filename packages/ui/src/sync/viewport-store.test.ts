import { beforeEach, describe, expect, test } from "bun:test"
import { useViewportStore } from "./viewport-store"

describe("viewport-store sessionMemoryState", () => {
  beforeEach(() => {
    useViewportStore.setState({ sessionMemoryState: new Map(), isSyncing: false })
  })

  test("records viewport anchors per session", () => {
    useViewportStore.getState().updateViewportAnchor("ses_1", 42)
    const entry = useViewportStore.getState().sessionMemoryState.get("ses_1")
    expect(entry?.viewportAnchor).toBe(42)
  })

  test("caps the map and evicts the least-recently-accessed sessions", () => {
    const { updateViewportAnchor } = useViewportStore.getState()
    // Insert 250 distinct sessions; oldest-inserted are also least-recently
    // accessed, so they must be the ones evicted down to the 200 cap.
    for (let i = 0; i < 250; i++) {
      updateViewportAnchor(`ses_${i}`, i)
    }

    const map = useViewportStore.getState().sessionMemoryState
    expect(map.size).toBe(200)
    // First 50 evicted, most recent retained.
    expect(map.has("ses_0")).toBe(false)
    expect(map.has("ses_49")).toBe(false)
    expect(map.has("ses_50")).toBe(true)
    expect(map.has("ses_249")).toBe(true)
  })
})
