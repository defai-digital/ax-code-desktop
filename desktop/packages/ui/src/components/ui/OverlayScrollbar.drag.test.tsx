import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OverlayScrollbar } from "./OverlayScrollbar"

// The thumb is inset from the track on both ends (`OverlayScrollbar` positions it at `TRACK_INSET + offset` inside a
// track of `clientHeight - 2 * TRACK_INSET`).
const TRACK_INSET = 8

const frames = { current: [] as FrameRequestCallback[] }

describe("OverlayScrollbar drag mapping", () => {
  let container: HTMLDivElement
  let root: Root
  let scrollContainerRef: React.RefObject<HTMLDivElement | null>
  let scrollTop = 0

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("ResizeObserver", undefined)
    // Frames are collected and run on demand: running one inside the call that requested it left the ref holding
    // the id `requestAnimationFrame` returns, which is the guard the next request checks.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.current.push(callback)
      return frames.current.length
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
    // jsdom has no pointer capture.
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} })
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} })

    frames.current = []
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

  const runFrames = () =>
    act(() => {
      for (const callback of frames.current.splice(0)) {
        callback(0)
      }
    })

  const render = ({ suppressVisibility = false } = {}) =>
    act(() => {
      root.render(
        <div ref={scrollContainerRef}>
          <OverlayScrollbar
            containerRef={scrollContainerRef}
            observeMutations={false}
            suppressVisibility={suppressVisibility}
          />
        </div>,
      )
    })

  test("forgets a drag whose thumb disappears before the pointer is released", () => {
    // The thumb unmounts when the content stops overflowing, so the pointerup that clears the flag is delivered
    // to an element that is no longer there. The stale flag then made every programmatic scroll show a bar the
    // `suppressVisibility` path is meant to keep hidden.
    render({ suppressVisibility: true })
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) throw new Error("container not rendered")

    let scrollHeight = 3000
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 300 })
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, get: () => scrollHeight })
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, get: () => 0, set: () => {} })

    act(() => {
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })
    runFrames()

    const thumb = container.querySelector('[data-overlay-scrollbar-thumb="vertical"]')
    if (!(thumb instanceof HTMLElement)) throw new Error("vertical thumb not rendered")
    act(() => {
      thumb.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 0, clientX: 0 }))
    })

    // The content shrinks under the drag: the thumb unmounts and no pointerup is ever delivered.
    scrollHeight = 300
    act(() => {
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })
    runFrames()
    expect(container.querySelector('[data-overlay-scrollbar-thumb="vertical"]')).toBeNull()

    scrollHeight = 3000
    act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"))
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })
    runFrames()

    const bar = container.querySelector(".overlay-scrollbar")
    if (!(bar instanceof HTMLElement)) throw new Error("scrollbar not rendered")
    expect(bar.style.opacity).toBe("0")
  })

  test("forgets the drag when the dragged axis's thumb goes away but the other stays", () => {
    // The drag belongs to one axis, so a thumb on the other axis keeping the bar alive is not the thumb the pointer
    // captured. Keying the reset on "no thumb at all" left the flag set here, and the bar then showed for the
    // programmatic scrolls `suppressVisibility` exists to hide.
    render({ suppressVisibility: true })
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) throw new Error("container not rendered")

    let scrollHeight = 3000
    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 300 })
    Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 300 })
    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, get: () => scrollHeight })
    Object.defineProperty(scrollContainer, "scrollWidth", { configurable: true, value: 600 })
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, get: () => 0, set: () => {} })
    Object.defineProperty(scrollContainer, "scrollLeft", { configurable: true, get: () => 0, set: () => {} })

    act(() => {
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })
    runFrames()

    const verticalThumb = container.querySelector('[data-overlay-scrollbar-thumb="vertical"]')
    if (!(verticalThumb instanceof HTMLElement)) throw new Error("vertical thumb not rendered")
    expect(container.querySelector('[data-overlay-scrollbar-thumb="horizontal"]')).not.toBeNull()
    act(() => {
      verticalThumb.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 0, clientX: 0 }))
    })

    // The vertical axis stops overflowing; the horizontal one still does, so a thumb is still on screen.
    scrollHeight = 300
    act(() => {
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })
    runFrames()
    expect(container.querySelector('[data-overlay-scrollbar-thumb="vertical"]')).toBeNull()
    expect(container.querySelector('[data-overlay-scrollbar-thumb="horizontal"]')).not.toBeNull()

    scrollHeight = 3000
    act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"))
      scrollContainer.dispatchEvent(new Event("input", { bubbles: true }))
    })
    runFrames()

    const bar = container.querySelector(".overlay-scrollbar")
    if (!(bar instanceof HTMLElement)) throw new Error("scrollbar not rendered")
    expect(bar.style.opacity).toBe("0")
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
    runFrames()

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
