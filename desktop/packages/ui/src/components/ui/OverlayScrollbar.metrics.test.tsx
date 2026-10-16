import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OverlayScrollbar } from "./OverlayScrollbar"

// Frames are collected instead of run, so a frame can still be pending when the effect re-runs.
const { queued } = vi.hoisted(() => ({ queued: { current: [] as FrameRequestCallback[] } }))

// Declared once so a re-render updates the same instance: a fresh component type per render would
// remount the scrollbar and give it a new, empty frame ref, which is the state this test is not about.
const Probe = ({
  scrollContainerRef,
  suppress,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  suppress: boolean
}) => (
  <div ref={scrollContainerRef}>
    <OverlayScrollbar containerRef={scrollContainerRef} suppressVisibility={suppress} observeMutations={false} />
  </div>
)

describe("OverlayScrollbar metrics frames", () => {
  let container: HTMLDivElement
  let root: Root
  let scrollContainerRef: React.RefObject<HTMLDivElement | null>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    queued.current = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queued.current.push(callback)
      return queued.current.length
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
    vi.stubGlobal("ResizeObserver", undefined)

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    scrollContainerRef = { current: null }
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = (suppressVisibility: boolean) => {
    act(() => {
      root.render(<Probe scrollContainerRef={scrollContainerRef} suppress={suppressVisibility} />)
    })
  }

  const requestMetricsFrame = () => {
    act(() => {
      scrollContainerRef.current?.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  // The cleanup cancelled the pending frame but left its id in the ref, and only the frame's own
  // callback cleared it — so the guard skipped every later request and the thumb stopped tracking
  // content growth and resizes for the rest of the instance's life.
  test("keeps scheduling metrics after the effect re-runs with a frame pending", () => {
    render(false)
    requestMetricsFrame()
    expect(queued.current).toHaveLength(1)

    // A pending frame plus a dependency change: `suppressVisibility` reaches the effect through
    // `handleScroll`, so the effect tears down and sets up again while the frame is still queued.
    render(true)
    queued.current = []

    requestMetricsFrame()

    expect(queued.current).toHaveLength(1)
  })
})
