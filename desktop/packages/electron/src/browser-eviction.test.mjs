import { EventEmitter } from "node:events"
import { runInNewContext } from "node:vm"
import { afterEach, expect, test, vi } from "vitest"
import { canDiscardDocument, closeForEviction } from "./browser-eviction.js"

afterEach(() => vi.useRealTimers())

test.each(["plain", "property-handler", "listener", "editor", "custom-element", "shadow-root", "design-mode"])(
  "the document probe retains possible unsaved surfaces: %s",
  async (kind) => {
    const window = { onbeforeunload: kind === "property-handler" ? () => {} : null }
    const document = {
      designMode: kind === "design-mode" ? "on" : "off",
      querySelector: () => (kind === "editor" ? {} : null),
      querySelectorAll: () => [
        { localName: kind === "custom-element" ? "my-editor" : "div", shadowRoot: kind === "shadow-root" ? {} : null },
      ],
    }
    const sendCommand = vi.fn(async (method, params) => {
      if (method === "Runtime.evaluate") {
        const value = runInNewContext(params.expression, { document, window })
        return { result: value === window ? { objectId: "window" } : { value } }
      }
      if (method === "DOMDebugger.getEventListeners")
        return { listeners: kind === "listener" ? [{ type: "beforeunload" }] : [] }
      return {}
    })
    expect(await canDiscardDocument({ isDestroyed: () => false, debugger: { sendCommand } })).toBe(kind === "plain")
    expect(sendCommand).toHaveBeenCalledWith("Runtime.releaseObjectGroup", { objectGroup: "eviction-check" })
  },
)

test.each(["closed", "veto", "stuck", "throw"])(
  "automatic closure honors beforeunload and cleans listeners: %s",
  async (kind) => {
    vi.useFakeTimers()
    const contents = new EventEmitter()
    let destroyed = false
    contents.isDestroyed = () => destroyed
    contents.close = vi.fn(() => {
      if (kind === "throw") throw new Error("Closing failed")
      if (kind === "closed") {
        destroyed = true
        contents.emit("destroyed")
      }
      if (kind === "veto") contents.emit("will-prevent-unload", {})
    })
    const result = closeForEviction(contents)
    if (kind === "stuck") await vi.runAllTimersAsync()
    expect(await result).toBe(kind === "closed")
    expect(contents.close).toHaveBeenCalledExactlyOnceWith({ waitForBeforeUnload: true })
    expect(contents.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  },
)


test("a detached debugger fails closed even when probe and cleanup throw synchronously", async () => {
  const contents = { isDestroyed: () => false, debugger: { sendCommand() { throw new Error("Debugger detached") } } }
  expect(await canDiscardDocument(contents)).toBe(false)
})

test.each([0, 1, 2, 3])("a stalled debugger command %s retains the page and releases the queue", async (stalled) => {
  vi.useFakeTimers()
  let index = 0
  const sendCommand = vi.fn(() => {
    const current = index++
    if (current === stalled) return new Promise(() => {})
    return Promise.resolve(current === 0 ? { result: { value: false } } : current === 1 ? { result: { objectId: "window" } } : { listeners: [] })
  })
  const queued = canDiscardDocument({ isDestroyed: () => false, debugger: { sendCommand } }).then((discard) => ({ discard, queueReleased: true }))
  await vi.runAllTimersAsync()
  expect(await queued).toEqual({ discard: false, queueReleased: true })
  expect(vi.getTimerCount()).toBe(0)
})
