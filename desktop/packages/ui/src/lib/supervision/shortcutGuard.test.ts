import { describe, expect, test } from "vitest"

import { supervisionShortcutAllowed, type ShortcutGuardInput } from "./shortcutGuard"

const base: ShortcutGuardInput = { isComposing: false, modalOpen: false, inCodeEditor: false, inTextField: false }

describe("supervisionShortcutAllowed", () => {
  test("fires on ordinary targets", () => {
    expect(supervisionShortcutAllowed("navigate", base)).toBe(true)
    expect(supervisionShortcutAllowed("open-surface", base)).toBe(true)
  })

  test("never fires while composing, under a modal, or inside a code editor", () => {
    for (const override of [{ isComposing: true }, { modalOpen: true }, { inCodeEditor: true }]) {
      expect(supervisionShortcutAllowed("open-surface", { ...base, ...override })).toBe(false)
      expect(supervisionShortcutAllowed("navigate", { ...base, ...override })).toBe(false)
    }
  })

  test("text fields keep navigation keys but allow surface shortcuts", () => {
    expect(supervisionShortcutAllowed("navigate", { ...base, inTextField: true })).toBe(false)
    expect(supervisionShortcutAllowed("open-surface", { ...base, inTextField: true })).toBe(true)
  })
})
