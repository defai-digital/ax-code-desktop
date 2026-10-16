import { describe, expect, test } from "vitest"
import {
  eventMatchesShortcut,
  getCustomizableShortcutActions,
  getEffectiveShortcutCombo,
  getShortcutAction,
} from "./shortcuts"

describe("search_all_sessions shortcut", () => {
  test("is registered, customizable, and defaults to mod+alt+f", () => {
    const action = getShortcutAction("search_all_sessions")
    expect(action?.customizable).toBe(true)
    expect(getEffectiveShortcutCombo("search_all_sessions")).toBe("mod+alt+f")
    // Rebinding through overrides wins over the default.
    expect(getEffectiveShortcutCombo("search_all_sessions", { search_all_sessions: "mod+shift+k" })).toBe("mod+shift+k")
  })

  test("its default combo is not shared with any other action", () => {
    const combo = getEffectiveShortcutCombo("search_all_sessions")
    const sharing = getCustomizableShortcutActions().filter((action) => getEffectiveShortcutCombo(action.id) === combo)
    expect(sharing.map((action) => action.id)).toEqual(["search_all_sessions"])
  })

  test("matches Mod+Alt+F keyboard events but not plain Mod+F", () => {
    const combo = getEffectiveShortcutCombo("search_all_sessions")
    // With Alt held, matching reads the physical `code` because `key` becomes
    // a composed character on macOS layouts.
    // Ctrl counts as Mod outside the macOS desktop shell (and alongside Meta
    // on macOS web), so it matches in this test environment either way.
    expect(
      eventMatchesShortcut(
        new KeyboardEvent("keydown", { key: "ƒ", code: "KeyF", ctrlKey: true, altKey: true }),
        combo,
      ),
    ).toBe(true)
    expect(eventMatchesShortcut(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true }), combo)).toBe(
      false,
    )
  })
})
