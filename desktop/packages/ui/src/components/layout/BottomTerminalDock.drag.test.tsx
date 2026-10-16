import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { BottomTerminalDock } from "./BottomTerminalDock"
import { I18nProvider } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"

describe("BottomTerminalDock resize drag", () => {
  let container: HTMLDivElement
  let root: Root
  let setPointerCapture: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    setPointerCapture = vi.fn()
    Object.defineProperty(Element.prototype, "setPointerCapture", { configurable: true, value: setPointerCapture })
    Object.defineProperty(Element.prototype, "releasePointerCapture", { configurable: true, value: () => {} })
    useUIStore.setState({ bottomTerminalHeight: 300, isBottomTerminalExpanded: false })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  const render = () =>
    act(() =>
      root.render(
        <I18nProvider>
          <BottomTerminalDock isOpen isMobile={false}>
            <div />
          </BottomTerminalDock>
        </I18nProvider>,
      ),
    )

  const handle = () => {
    const element = container.querySelector('[role="separator"]')
    if (!(element instanceof HTMLElement)) throw new Error("resize handle not rendered")
    return element
  }

  const startDrag = () =>
    act(() => {
      handle().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 200, pointerId: 7 }))
    })

  const moveTo = (clientY: number) =>
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY, pointerId: 7 }))
    })

  const height = () => useUIStore.getState().bottomTerminalHeight

  test("captures the pointer, so a release outside the window still ends the drag", () => {
    // The drag listened on `window` without capturing the pointer, so a release outside the Electron window was
    // never delivered: `isResizing` stayed true and the dock kept following the pointer with no button down. The
    // sibling splitters capture for the same reason.
    render()
    startDrag()

    expect(setPointerCapture).toHaveBeenCalledWith(7)
  })

  test("a cancelled pointer ends the drag instead of leaving it running", () => {
    render()
    startDrag()
    moveTo(100)
    const moved = height()
    expect(moved).toBeGreaterThan(300)

    act(() => {
      window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7 }))
    })
    moveTo(50)

    expect(height()).toBe(moved)
  })

  test("a normal pointerup still ends the drag", () => {
    render()
    startDrag()
    moveTo(100)

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }))
    })
    moveTo(50)

    expect(height()).toBe(400)
  })
})
