"use strict"

// Absence of browser operations is not proof that a document is disposable. Editable surfaces,
// child frames and drawing surfaces are conservatively retained even before the first edit.
async function canDiscardDocument(contents) {
  if (contents.isDestroyed()) return true
  let commandFailed = false
  const send = async (method, params) => {
    let timer
    try {
      return await Promise.race([
        Promise.resolve().then(() => contents.debugger.sendCommand(method, params)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Eviction probe deadline exceeded")), 250) }),
      ])
    } catch (error) {
      commandFailed = true
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  let disposable = false
  try {
    const surface = await send("Runtime.evaluate", {
      expression: `Boolean(window.onbeforeunload || document.designMode === "on" || [...document.querySelectorAll("*")].some(element => element.localName.includes("-") || element.shadowRoot) || document.querySelector('input, textarea, select, [contenteditable]:not([contenteditable="false"]), iframe, frame, canvas'))`,
      returnByValue: true,
    })
    if (surface.exceptionDetails || surface.result?.value !== false) return false
    const window = await send("Runtime.evaluate", { expression: "window", objectGroup: "eviction-check" })
    if (!window.result?.objectId) return false
    const { listeners } = await send("DOMDebugger.getEventListeners", { objectId: window.result.objectId })
    disposable = Array.isArray(listeners) && !listeners.some((listener) => listener.type === "beforeunload")
  } catch {
    return false
  } finally {
    try {
      await send("Runtime.releaseObjectGroup", { objectGroup: "eviction-check" })
    } catch {
      // Destruction or debugger detachment can also make cleanup fail synchronously.
    }
  }
  return disposable && !commandFailed
}

// Do not detach, revoke, or remove pool ownership until Chromium confirms closure. A handler
// installed after the probe can still veto; a stuck close leaves the original page intact.
function closeForEviction(contents) {
  if (contents.isDestroyed()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (closed) => {
      clearTimeout(timer)
      contents.removeListener("destroyed", destroyed)
      contents.removeListener("will-prevent-unload", prevented)
      resolve(closed)
    }
    const destroyed = () => finish(true)
    const prevented = () => finish(false)
    const timer = setTimeout(() => finish(false), 1000)
    contents.once("destroyed", destroyed)
    contents.once("will-prevent-unload", prevented)
    try {
      contents.close({ waitForBeforeUnload: true })
      if (contents.isDestroyed()) finish(true)
    } catch {
      finish(false)
    }
  })
}

module.exports = { canDiscardDocument, closeForEviction }
