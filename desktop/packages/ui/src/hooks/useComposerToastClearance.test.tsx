import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { COMPOSER_TOAST_CLEARANCE_VAR, useComposerToastClearance } from "./useComposerToastClearance"

let resizeCallbacks: Array<() => void> = []
class FakeResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    resizeCallbacks.push(this.callback)
  }
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((callback) => callback !== this.callback)
  }
}

let top = 800
function Composer({ enabled }: { enabled: boolean }) {
  return <ComposerForm enabled={enabled} />
}
function ComposerForm({ enabled }: { enabled: boolean }) {
  const ref = React.useRef<HTMLFormElement>(null)
  useComposerToastClearance(ref, enabled)
  return <form ref={ref} />
}

describe("useComposerToastClearance", () => {
  let container: HTMLDivElement
  let root: Root
  const clearance = () => document.documentElement.style.getPropertyValue(COMPOSER_TOAST_CLEARANCE_VAR)

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    vi.spyOn(HTMLFormElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ top }) as DOMRect)
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 })
    top = 800
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("publishes the composer height from the window bottom and follows it as the draft grows", () => {
    act(() => root.render(<Composer enabled />))
    expect(clearance()).toBe("200px")
    top = 650
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(clearance()).toBe("350px")
  })

  test("clears the value when the composer unmounts or is disabled", () => {
    act(() => root.render(<Composer enabled />))
    expect(clearance()).toBe("200px")
    act(() => root.render(<Composer enabled={false} />))
    expect(clearance()).toBe("")
    act(() => root.render(<Composer enabled />))
    act(() => root.render(<div />))
    expect(clearance()).toBe("")
  })

  test("a replaced composer's cleanup keeps the value written by its successor", () => {
    act(() => root.render(<ComposerForm key="draft" enabled />))
    top = 700
    act(() => root.render(<ComposerForm key="session" enabled />))
    expect(clearance()).toBe("300px")
  })
})
