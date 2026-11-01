import { describe, expect, test } from "vitest"
import { isContextPanelHiddenUnderGrid } from "./contextPanelVisibility"

describe("isContextPanelHiddenUnderGrid", () => {
  test("hides the panel under the session grid until the grid's browser takes focus", () => {
    expect(isContextPanelHiddenUnderGrid("session-grid", false)).toBe(true)
    expect(isContextPanelHiddenUnderGrid("session-grid", true)).toBe(false)
  })

  test("never hides the panel beside another main tab", () => {
    expect(isContextPanelHiddenUnderGrid("chat", false)).toBe(false)
    expect(isContextPanelHiddenUnderGrid("files", true)).toBe(false)
  })
})
