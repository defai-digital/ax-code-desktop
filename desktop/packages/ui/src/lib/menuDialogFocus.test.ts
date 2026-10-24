import { describe, expect, test } from "vitest"
import { isTransientMenuDismissal, MENU_DIALOG_DISMISSAL_GRACE_MS } from "./menuDialogFocus"
import { manualUpdateCheckOutcome } from "./manualUpdateCheckOutcome"

describe("isTransientMenuDismissal", () => {
  test("ignores a menu focus-out while the dialog has just opened", () => {
    expect(isTransientMenuDismissal("focus-out", 1_000, 1_000 + MENU_DIALOG_DISMISSAL_GRACE_MS - 1, true)).toBe(true)
  })

  test("ignores a menu backdrop event only inside the grace period", () => {
    expect(isTransientMenuDismissal("outside-press", 1_000, 1_100, false)).toBe(false)
    expect(isTransientMenuDismissal("outside-press", 1_000, 1_100, true)).toBe(true)
    expect(isTransientMenuDismissal("outside-press", 1_000, 1_000 + MENU_DIALOG_DISMISSAL_GRACE_MS, true)).toBe(false)
  })

  test("allows focus-out for an ordinary dialog", () => {
    expect(isTransientMenuDismissal("focus-out", 1_000, 1_100, false)).toBe(false)
  })

  test("allows expired focus-out, Escape and the close button", () => {
    expect(isTransientMenuDismissal("focus-out", 1_000, 1_000 + MENU_DIALOG_DISMISSAL_GRACE_MS, true)).toBe(false)
    expect(isTransientMenuDismissal("escape-key", 1_000, 1_100, true)).toBe(false)
    expect(isTransientMenuDismissal("close-press", 1_000, 1_100, true)).toBe(false)
    expect(isTransientMenuDismissal("focus-out", 0, 1_100, true)).toBe(false)
  })
})

describe("manualUpdateCheckOutcome", () => {
  test("opens the update dialog when a desktop version is available", () => {
    expect(
      manualUpdateCheckOutcome({
        error: null,
        available: true,
        info: { version: "7.28.8" },
        runtimeType: "desktop",
      }),
    ).toBe("open-update")
  })

  test("reports the latest version when the check finds nothing", () => {
    expect(
      manualUpdateCheckOutcome({
        error: null,
        available: false,
        info: { currentVersion: "7.28.7" },
        runtimeType: "desktop",
      }),
    ).toBe("up-to-date")
  })

  test("reports failure when the check errors, never starts, or has no release info", () => {
    expect(
      manualUpdateCheckOutcome({
        error: "Update failed. Please try again or open the release page.",
        available: false,
        info: null,
        runtimeType: "desktop",
      }),
    ).toBe("failed")
    expect(
      manualUpdateCheckOutcome({
        error: null,
        available: false,
        info: null,
        runtimeType: null,
      }),
    ).toBe("failed")
    expect(
      manualUpdateCheckOutcome({
        error: null,
        available: true,
        info: null,
        runtimeType: "desktop",
      }),
    ).toBe("failed")
  })
})
