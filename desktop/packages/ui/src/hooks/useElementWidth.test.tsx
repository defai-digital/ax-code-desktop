import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { useElementWidth } from "./useElementWidth"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test("tracks pane resizing and reappearance without remounting its draft", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let width = 450
  let notify = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  function Pane() {
    const measurement = useElementWidth<HTMLDivElement>()
    return (
      <div ref={measurement.ref} data-width={measurement.width}>
        <input defaultValue="Unsaved comment" />
      </div>
    )
  }
  try {
    act(() => root.render(<Pane />))
    const input = container.querySelector("input")
    expect(container.firstElementChild?.getAttribute("data-width")).toBe("450")
    for (const next of [0, 1200, 600]) {
      width = next
      act(() => notify())
      expect(container.firstElementChild?.getAttribute("data-width")).toBe(String(next))
      expect(container.querySelector("input")).toBe(input)
      expect(input?.value).toBe("Unsaved comment")
    }
  } finally {
    act(() => root.unmount())
    container.remove()
  }
  expect(disconnect).toHaveBeenCalledOnce()
})
