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

module.exports = { FOCUS_MAIN_WINDOW_ACTION, resolveFocusMainWindowAction }
