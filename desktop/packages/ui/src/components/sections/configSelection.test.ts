import { describe, expect, test } from "vitest"
import { isStaleConfigSelection } from "./configSelection"

describe("isStaleConfigSelection", () => {
  test("keeps the selection while the list is still loading", () => {
    // Nothing has resolved yet, so a missing item proves nothing.
    expect(isStaleConfigSelection({ isLoading: true, selectedName: "agent-1", selectedItem: null })).toBe(false)
  })

  test("keeps a selection that resolves against the loaded list", () => {
    expect(
      isStaleConfigSelection({ isLoading: false, selectedName: "agent-1", selectedItem: { name: "agent-1" } }),
    ).toBe(false)
  })

  test("flags a persisted selection that no longer resolves", () => {
    expect(isStaleConfigSelection({ isLoading: false, selectedName: "gone", selectedItem: null })).toBe(true)
    expect(isStaleConfigSelection({ isLoading: false, selectedName: undefined, selectedItem: null })).toBe(false)
  })

  test("keeps the selection while a new item is being created", () => {
    // The draft is not in the list yet, and the editor is bound to the draft rather than the name.
    expect(
      isStaleConfigSelection({
        isLoading: false,
        selectedName: "new-agent",
        selectedItem: null,
        draft: { name: "new-agent" },
      }),
    ).toBe(false)
  })
})
