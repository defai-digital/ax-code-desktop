import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OverlayScrollbar } from "./OverlayScrollbar"

// The thumb is inset from the track on both ends (`OverlayScrollbar` positions it at `TRACK_INSET + offset` inside a
// track of `clientHeight - 2 * TRACK_INSET`).
const TRACK_INSET = 8

describe("OverlayScrollbar drag mapping", () => {
  let container: HTMLDivElement
  let root: Root
  let scrollContainerRef: React.RefObject<HTMLDivElement | null>
  let scrollTop = 0

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("ResizeObserver", undefined)
    // Frames run as they are requested: the metrics update then happens inside the same dispatch.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
    // jsdom has no pointer capture.
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} })
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} })

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    scrollContainerRef = { current: null }
    scrollTop = 0
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  const render = () =>
    act(() => {
      root.render(
        <div ref={scrollContainerRef}>
          <OverlayScrollbar containerRef={scrollContainerRef} observeMutations={false} />
        </div>,
      )
    })

  test("drags the thumb over the same travel it is positioned with", () => {
    // The thumb's travel is the track minus its own length, and the track is short by `TRACK_INSET` at both ends.
    // The drag mapped pointer movement over the *full* height, so the content scrolled slower than the pointer and
    // the thumb drifted away from it: dragging the thumb to the end of its travel left the content short of the end.
    render()
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) throw new Error("container not rendered")

    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 300 })
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 3000 })
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value
      },
    })

    act(() => {
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const thumb = container.querySelector('[data-overlay-scrollbar-thumb="vertical"]')
    if (!(thumb instanceof HTMLElement)) throw new Error("vertical thumb not rendered")
    const thumbLength = Number.parseFloat(thumb.style.height)
    expect(thumbLength).toBeGreaterThan(0)

    const travel = 300 - TRACK_INSET * 2 - thumbLength
    act(() => {
      thumb.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 0, clientX: 0 }))
    })
    act(() => {
      thumb.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: travel, clientX: 0 }))
    })

    expect(scrollTop).toBeCloseTo(3000 - 300, 5)
  })
})
