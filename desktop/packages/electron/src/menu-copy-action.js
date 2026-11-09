"use strict"

// Edit > Copy for the native menus. Copy runs on the web contents that actually has focus:
// the embedded project browser (a WebContentsView) and the context preview (<webview>) are
// guests with their own web contents, so copying from the focused window's main contents
// copied the app renderer's selection instead of the text selected in the guest.
// Only when the window's own renderer has focus does the renderer's copy handler run as well:
// sending it to a guest-focused or unfocused window overwrote the clipboard with a stale
// selection, and copy with nothing focused must not re-create a window.
function createMenuCopyAction({ getFocusedWindow, getFocusedWebContents, getMenuTargetWindow, dispatchAction }) {
  return () => {
    const focusedWindow = getFocusedWindow()
    if (!focusedWindow) return
    const focusedContents = getFocusedWebContents()
    const target = focusedContents && !focusedContents.isDestroyed() ? focusedContents : focusedWindow.webContents
    target.copy()
    if (target === focusedWindow.webContents && focusedWindow === getMenuTargetWindow()) dispatchAction("copy")
  }
}

module.exports = { createMenuCopyAction }
