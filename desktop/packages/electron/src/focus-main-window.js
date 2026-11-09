"use strict"

// desktop_focus_main_window hands a coding session (or a new-session draft) over
// to the main window. The hand-off travels over IPC, which only works once the
// renderer has mounted its listener ('ax-code:renderer-app-ready'); before that
// the event reaches nobody. Deciding between delivering and queueing is what
// keeps the mini-chat that requested the hand-off from closing itself onto a
// lost draft: it closes whenever this command reports success, so success must
// mean "the hand-off will be honored".

const FOCUS_MAIN_WINDOW_ACTION = {
  /** The renderer is listening: emit the hand-off now. */
  DELIVER: "deliver",
  /** No listener yet (fresh window, reload): queue it for the ready signal. */
  QUEUE: "queue",
  /** No window to hand off to: the caller must keep its own window. */
  UNAVAILABLE: "unavailable",
}

const resolveFocusMainWindowAction = ({ hasUsableWindow, rendererReady }) => {
  if (!hasUsableWindow) {
    return FOCUS_MAIN_WINDOW_ACTION.UNAVAILABLE
  }
  return rendererReady ? FOCUS_MAIN_WINDOW_ACTION.DELIVER : FOCUS_MAIN_WINDOW_ACTION.QUEUE
}

const RENDERER_READINESS_EVENT = {
  /** The main frame started a navigation (load, reload, or a hash route change). */
  LOAD_STARTED: "load-started",
  /** A main-frame load failed into an error page, which replaced the document. */
  LOAD_FAILED: "load-failed",
  /** Loading stopped. Without a commit in between, the started navigation was cancelled. */
  LOAD_STOPPED: "load-stopped",
  /** The renderer is gone or being replaced outright (crash, new window, cache reload). */
  RESET: "reset",
  /** A settled navigation that did not replace the document (a hash route change). */
  IN_PAGE_NAVIGATED: "in-page-navigated",
  /** A settled navigation that replaced the document; a new renderer will signal ready. */
  DOCUMENT_NAVIGATED: "document-navigated",
  /** The renderer sent 'ax-code:renderer-app-ready'. */
  APP_READY: "app-ready",
}

// Hand-off readiness reducer for the main window. main resets the flag when the main
// frame starts navigating, but an in-page (hash) navigation does that without
// re-running the preload, and 'ax-code:renderer-app-ready' is sent once per
// document - so clearing alone left every later open-project/menu hand-off queued
// until the app restarted. `savedReady` carries the pre-load answer across such a
// load; `flush` reports that a navigation restored readiness the caller must now
// drain its queues for, which happens at most once per restore.
const nextRendererReadiness = (state, event) => {
  const ready = Boolean(state && state.ready)
  const savedReady = Boolean(state && state.savedReady)
  switch (event) {
    case RENDERER_READINESS_EVENT.LOAD_STARTED:
      // Keep the answer for an in-page navigation to restore; a real load replaces
      // the document and its listeners, so nothing may be delivered meanwhile. A second
      // start before any commit keeps the answer saved by the first.
      return { ready: false, savedReady: ready || savedReady, flush: false }
    case RENDERER_READINESS_EVENT.LOAD_FAILED:
    case RENDERER_READINESS_EVENT.RESET:
      // Nothing saved may come back: a later did-stop-loading would otherwise restore it
      // into a renderer that no longer exists.
      return { ready: false, savedReady: false, flush: false }
    case RENDERER_READINESS_EVENT.LOAD_STOPPED:
      // A navigation the guards blocked (will-navigate) or that never committed leaves
      // the document and its listeners in place, yet emits no did-navigate: restore the
      // saved answer. A committed load cleared it already, so nothing is restored then.
      return { ready: ready || savedReady, savedReady: false, flush: !ready && savedReady }
    case RENDERER_READINESS_EVENT.IN_PAGE_NAVIGATED:
      return {
        ready: ready || savedReady,
        savedReady: false,
        flush: !ready && savedReady,
      }
    case RENDERER_READINESS_EVENT.DOCUMENT_NAVIGATED:
      // The previous document's readiness is gone with it: the new renderer has to
      // signal ready itself, so nothing is restorable from here.
      return { ready: false, savedReady: false, flush: false }
    case RENDERER_READINESS_EVENT.APP_READY:
      return { ready: true, savedReady: false, flush: false }
    default:
      return { ready, savedReady, flush: false }
  }
}

// Only main-frame navigations affect hand-off readiness. 'did-start-loading' also fires
// when any iframe starts loading (Dashboard, file previews, Markdown embeds) with no
// following 'did-navigate' or ready signal, which left the window "not ready" and queued
// menu and mini-chat hand-offs until an unrelated route change.
const readinessEventForNavigationStart = (details) =>
  details && details.isMainFrame === true ? RENDERER_READINESS_EVENT.LOAD_STARTED : null

// net::ERR_ABORTED: the navigation was cancelled (stopped or superseded) and committed
// nothing, so the current document survives. Any other main-frame failure commits an
// error page in its place.
const ERR_ABORTED = -3
const readinessEventForLoadFailure = (errorCode, isMainFrame) =>
  isMainFrame === true && errorCode !== ERR_ABORTED ? RENDERER_READINESS_EVENT.LOAD_FAILED : null

module.exports = {
  FOCUS_MAIN_WINDOW_ACTION,
  RENDERER_READINESS_EVENT,
  nextRendererReadiness,
  readinessEventForLoadFailure,
  readinessEventForNavigationStart,
  resolveFocusMainWindowAction,
}
