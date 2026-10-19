import { describe, expect, test } from "vitest"
import {
  eventMatchesShortcut,
  formatShortcutForDisplay,
  getCustomizableShortcutActions,
  getEffectiveShortcutCombo,
  getShortcutAction,
  keyToShortcutToken,
  normalizeCombo,
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

describe("shifted comma and period keys", () => {
  // The settings capture path records the token from keyToShortcutToken and
  // then runs normalizeCombo, which canonicalizes ","/"." to comma/period.
  // The event-matching path only runs keyToShortcutToken, so both sides must
  // produce the same canonical token or a recorded binding never fires.
  test("records Cmd/Ctrl+Shift+, as mod+shift+comma and matches it", () => {
    expect(keyToShortcutToken("<")).toBe("comma")

    const recorded = normalizeCombo(`mod+shift+${keyToShortcutToken("<")}`)
    expect(recorded).toBe("mod+shift+comma")

    const event = new KeyboardEvent("keydown", { key: "<", code: "Comma", ctrlKey: true, shiftKey: true })
    expect(eventMatchesShortcut(event, recorded)).toBe(true)
    expect(eventMatchesShortcut(event, "mod+shift+,")).toBe(true)
    expect(formatShortcutForDisplay(recorded).endsWith(",")).toBe(true)
  })

  test("records Cmd/Ctrl+Shift+. as mod+shift+period and matches it", () => {
    expect(keyToShortcutToken(">")).toBe("period")

    const recorded = normalizeCombo(`mod+shift+${keyToShortcutToken(">")}`)
    expect(recorded).toBe("mod+shift+period")

    const event = new KeyboardEvent("keydown", { key: ">", code: "Period", ctrlKey: true, shiftKey: true })
    expect(eventMatchesShortcut(event, recorded)).toBe(true)
    expect(eventMatchesShortcut(event, "mod+shift+.")).toBe(true)
    expect(formatShortcutForDisplay(recorded).endsWith(".")).toBe(true)
  })
})
