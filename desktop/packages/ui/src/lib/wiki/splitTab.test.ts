import { describe, expect, test } from "vitest"

import { isPersistedSplitPaneRightTab } from "./splitTab"

describe("isPersistedSplitPaneRightTab", () => {
  test("keeps historical split tabs and the wiki tab", () => {
    for (const tab of ["plan", "git", "diff", "terminal", "files", "context", "wiki"]) {
      expect(isPersistedSplitPaneRightTab(tab)).toBe(true)
    }
  })

  test("rejects values that are not a split-pane tab", () => {
    for (const value of ["chat", "settings", "", null, 1, undefined]) {
      expect(isPersistedSplitPaneRightTab(value)).toBe(false)
    }
  })
})
