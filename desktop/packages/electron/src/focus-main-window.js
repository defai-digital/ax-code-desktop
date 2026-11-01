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
  /** A settled navigation that did not replace the document (a hash route change). */
  IN_PAGE_NAVIGATED: "in-page-navigated",
  /** A settled navigation that replaced the document; a new renderer will signal ready. */
  DOCUMENT_NAVIGATED: "document-navigated",
  /** The renderer sent 'ax-code:renderer-app-ready'. */
  APP_READY: "app-ready",
}

// Hand-off readiness reducer for the main window. main resets the flag on
// 'did-start-loading', but an in-page (hash) navigation emits that event without
// re-running the preload, and 'ax-code:renderer-app-ready' is sent once per
// document - so clearing alone left every later open-project/menu hand-off queued
// until the app restarted. `savedReady` carries the pre-load answer across such a
// load; `flush` reports that a navigation restored readiness the caller must now
// drain its queues for, which happens at most once per restore.
const nextRendererReadiness = (state, event) => {
  const ready = Boolean(state && state.ready)
  const savedReady = Boolean(state && state.savedReady)
  switch (event) {
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

module.exports = {
  FOCUS_MAIN_WINDOW_ACTION,
  RENDERER_READINESS_EVENT,
  nextRendererReadiness,
  resolveFocusMainWindowAction,
}
