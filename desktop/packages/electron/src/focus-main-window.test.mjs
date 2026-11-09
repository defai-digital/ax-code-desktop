import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const {
  FOCUS_MAIN_WINDOW_ACTION,
  RENDERER_READINESS_EVENT,
  nextRendererReadiness,
  readinessEventForLoadFailure,
  readinessEventForNavigationStart,
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

describe("readinessEventForNavigationStart", () => {
  test("only a main-frame navigation start resets hand-off readiness", () => {
    // Electron emits 'did-start-loading' on the main webContents when an iframe starts loading,
    // followed by no 'did-navigate' and no new ready signal, so resetting on it left menu and
    // mini-chat hand-offs queued after any Dashboard or preview iframe loaded.
    expect(readinessEventForNavigationStart({ isMainFrame: false, isSameDocument: false })).toBeNull()
    expect(readinessEventForNavigationStart({ isMainFrame: true, isSameDocument: false })).toBe(
      RENDERER_READINESS_EVENT.LOAD_STARTED,
    )
    expect(readinessEventForNavigationStart({ isMainFrame: true, isSameDocument: true })).toBe(
      RENDERER_READINESS_EVENT.LOAD_STARTED,
    )
    expect(readinessEventForNavigationStart(undefined)).toBeNull()
  })

  test("an iframe load keeps a ready renderer ready; a main-frame hash navigation still restores it", () => {
    const ready = { ready: true, savedReady: false }
    const afterIframe = readinessEventForNavigationStart({ isMainFrame: false })
    expect(afterIframe).toBeNull()

    const started = nextRendererReadiness(ready, RENDERER_READINESS_EVENT.LOAD_STARTED)
    expect(started).toEqual({ ready: false, savedReady: true, flush: false })
    expect(nextRendererReadiness(started, RENDERER_READINESS_EVENT.IN_PAGE_NAVIGATED)).toEqual({
      ready: true,
      savedReady: false,
      flush: true,
    })
    // A real document load replaces the listeners: nothing is restorable.
    expect(nextRendererReadiness(started, RENDERER_READINESS_EVENT.DOCUMENT_NAVIGATED)).toEqual({
      ready: false,
      savedReady: false,
      flush: false,
    })
  })
})

describe("cancelled and failed main-frame navigations", () => {
  // Sequences recorded from Electron 45.2.3 for each case.
  const replay = (events, start = { ready: true, savedReady: false }) => {
    let state = start
    let flushed = 0
    for (const event of events) {
      state = nextRendererReadiness(state, event)
      if (state.flush) flushed += 1
    }
    return { ready: state.ready, flushed }
  }
  const E = RENDERER_READINESS_EVENT

  test("a navigation blocked by will-navigate restores readiness when loading stops", () => {
    // did-start-loading, did-start-navigation(main), will-navigate prevented, did-stop-loading.
    expect(replay([E.LOAD_STARTED, E.LOAD_STOPPED])).toEqual({ ready: true, flushed: 1 })
  })

  test("a load that fails into an error page stays not ready", () => {
    // did-start-navigation(main), did-fail-load(-312, main), did-finish-load, did-stop-loading.
    expect(readinessEventForLoadFailure(-312, true)).toBe(E.LOAD_FAILED)
    expect(replay([E.LOAD_STARTED, E.LOAD_FAILED, E.LOAD_STOPPED])).toEqual({ ready: false, flushed: 0 })
  })

  test("a committed reload waits for the new renderer instead of restoring at stop", () => {
    expect(replay([E.LOAD_STARTED, E.DOCUMENT_NAVIGATED, E.LOAD_STOPPED])).toEqual({ ready: false, flushed: 0 })
  })

  test("aborted and sub-frame failures do not drop readiness", () => {
    expect(readinessEventForLoadFailure(-3, true)).toBeNull()
    expect(readinessEventForLoadFailure(-312, false)).toBeNull()
    // A superseded navigation keeps the answer saved by the first start.
    expect(replay([E.LOAD_STARTED, E.LOAD_STARTED, E.LOAD_STOPPED])).toEqual({ ready: true, flushed: 1 })
  })

  test("a renderer reset drops the saved answer so a later stop cannot restore it", () => {
    // render-process-gone mid-load: the saved answer belonged to the dead renderer.
    expect(replay([E.LOAD_STARTED, E.RESET, E.LOAD_STOPPED])).toEqual({ ready: false, flushed: 0 })
  })

  test("loading that stops while already ready delivers nothing twice", () => {
    expect(replay([E.LOAD_STOPPED])).toEqual({ ready: true, flushed: 0 })
  })
})
