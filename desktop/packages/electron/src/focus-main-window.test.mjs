import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const {
  FOCUS_MAIN_WINDOW_ACTION,
  RENDERER_READINESS_EVENT,
  nextRendererReadiness,
  resolveFocusMainWindowAction,
} = require("./focus-main-window.js")

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

describe("nextRendererReadiness", () => {
  const readiness = (overrides = {}) => ({ ready: false, savedReady: false, ...overrides })

  test("restores readiness after an in-page navigation that preserved it, and flushes once", () => {
    // Regression: an in-page hash navigation emits 'did-start-loading' then
    // 'did-navigate-in-page' without re-running the preload, while
    // 'ax-code:renderer-app-ready' is sent once per document — so main cleared
    // readiness and never re-armed it. Later Settings and other native-menu
    // hand-offs stayed queued until the app restarted.
    const restored = nextRendererReadiness(readiness({ savedReady: true }), RENDERER_READINESS_EVENT.IN_PAGE_NAVIGATED)
    expect(restored).toEqual({ ready: true, savedReady: false, flush: true })

    // The flush is one-shot: an already-ready renderer navigates in-page again and
    // nothing is delivered a second time.
    expect(nextRendererReadiness(restored, RENDERER_READINESS_EVENT.IN_PAGE_NAVIGATED)).toEqual({
      ready: true,
      savedReady: false,
      flush: false,
    })
  })

  test("a renderer that was not ready stays not ready after an in-page navigation", () => {
    const next = nextRendererReadiness(readiness(), RENDERER_READINESS_EVENT.IN_PAGE_NAVIGATED)
    expect(next).toEqual({ ready: false, savedReady: false, flush: false })
  })

  test("a cross-document navigation drops saved readiness instead of restoring it", () => {
    // A real document load replaces the renderer: the new one must signal ready, and
    // the previous document's readiness must not be restorable.
    const navigated = nextRendererReadiness(
      readiness({ savedReady: true }),
      RENDERER_READINESS_EVENT.DOCUMENT_NAVIGATED,
    )
    expect(navigated).toEqual({ ready: false, savedReady: false, flush: false })
    expect(nextRendererReadiness(navigated, RENDERER_READINESS_EVENT.IN_PAGE_NAVIGATED)).toEqual({
      ready: false,
      savedReady: false,
      flush: false,
    })
  })

  test("the renderer's own ready signal marks readiness without asking for a flush flag", () => {
    // The ready path always flushes the queues; the reducer only reports whether a
    // navigation restored readiness that main has to re-flush.
    expect(nextRendererReadiness(readiness({ savedReady: true }), RENDERER_READINESS_EVENT.APP_READY)).toEqual({
      ready: true,
      savedReady: false,
      flush: false,
    })
  })
})
