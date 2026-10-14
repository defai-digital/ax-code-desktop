import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { FOCUS_MAIN_WINDOW_ACTION, resolveFocusMainWindowAction } = require("./focus-main-window.js")

describe("resolveFocusMainWindowAction", () => {
  test("delivers the hand-off once the renderer is listening", () => {
    expect(resolveFocusMainWindowAction({ hasUsableWindow: true, rendererReady: true })).toBe(
      FOCUS_MAIN_WINDOW_ACTION.DELIVER,
    )
  })

  test("queues the hand-off for a window whose renderer is not listening yet", () => {
    // Regression: the hand-off used to be emitted whenever a window existed. A
    // reloading or just-created renderer is not listening yet, so the event was
    // delivered to nobody while the command still reported success and the
    // mini-chat closed itself — losing the draft it was handing over.
    expect(resolveFocusMainWindowAction({ hasUsableWindow: true, rendererReady: false })).toBe(
      FOCUS_MAIN_WINDOW_ACTION.QUEUE,
    )
  })

  test("reports no hand-off when there is no window to receive it", () => {
    // Nothing will ever deliver it (the window failed to open), so the caller must
    // keep its own window rather than close on an empty hand-off.
    expect(resolveFocusMainWindowAction({ hasUsableWindow: false, rendererReady: true })).toBe(
      FOCUS_MAIN_WINDOW_ACTION.UNAVAILABLE,
    )
    expect(resolveFocusMainWindowAction({ hasUsableWindow: false, rendererReady: false })).toBe(
      FOCUS_MAIN_WINDOW_ACTION.UNAVAILABLE,
    )
  })
})
