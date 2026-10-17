import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createRoot, type Root } from "react-dom/client"
import { ScrollShadow } from "./ScrollShadow"

// jsdom has no layout, so give the element a scrollable geometry.
function setGeometry(el: HTMLElement, geometry: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, "scrollTop", { configurable: true, value: geometry.scrollTop })
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: geometry.scrollHeight })
  Object.defineProperty(el, "clientHeight", { configurable: true, value: geometry.clientHeight })
}

describe("ScrollShadow", () => {
  let container: HTMLDivElement
  let root: Root
  let frameCallbacks: FrameRequestCallback[]
  let rafCalls: number

  const flushFrames = async (rounds: number) => {
    for (let i = 0; i < rounds; i++) {
      const callbacks = frameCallbacks
      frameCallbacks = []
      await act(async () => {
        callbacks.forEach((callback) => callback(performance.now()))
        // MutationObserver callbacks are delivered as microtasks.
        await Promise.resolve()
        await Promise.resolve()
      })
    }
  }

  beforeEach(() => {
    frameCallbacks = []
    rafCalls = 0
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafCalls += 1
      frameCallbacks.push(callback)
      return rafCalls
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  test("settles once the overflow state is stable instead of rescheduling frames forever", async () => {
    await act(async () => {
      root.render(
        <ScrollShadow data-testid="shadow">
          <div>content</div>
        </ScrollShadow>,
      )
    })
    const el = container.querySelector<HTMLElement>("[data-testid='shadow']")!
    setGeometry(el, { scrollTop: 0, scrollHeight: 500, clientHeight: 100 })

    // A child change schedules one check; it must not keep scheduling more.
    await act(async () => {
      el.appendChild(document.createElement("span"))
      await Promise.resolve()
    })
    await flushFrames(10)

    const afterSettling = rafCalls
    await flushFrames(20)
    expect(rafCalls).toBe(afterSettling)
    expect(frameCallbacks).toHaveLength(0)
  })

  test("still reports the scroll state and updates it when the geometry changes", async () => {
    const onVisibilityChange = vi.fn()
    await act(async () => {
      root.render(
        <ScrollShadow data-testid="shadow" onVisibilityChange={onVisibilityChange}>
          <div>content</div>
        </ScrollShadow>,
      )
    })
    const el = container.querySelector<HTMLElement>("[data-testid='shadow']")!
    setGeometry(el, { scrollTop: 0, scrollHeight: 500, clientHeight: 100 })
    await act(async () => {
      el.appendChild(document.createElement("span"))
      await Promise.resolve()
    })
    await flushFrames(5)
    expect(el.dataset.bottomScroll).toBe("true")
    expect(el.dataset.topScroll).toBe("false")
    expect(onVisibilityChange).toHaveBeenLastCalledWith("bottom")

    setGeometry(el, { scrollTop: 200, scrollHeight: 500, clientHeight: 100 })
    await act(async () => {
      el.dispatchEvent(new Event("scroll"))
    })
    expect(el.dataset.topBottomScroll).toBe("true")
    expect(el.dataset.topScroll).toBeUndefined()
    expect(el.dataset.bottomScroll).toBeUndefined()
    expect(onVisibilityChange).toHaveBeenLastCalledWith("both")
  })
})
