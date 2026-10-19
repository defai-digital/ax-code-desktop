import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { MobileOverlayPanel } from "./MobileOverlayPanel"

const pressEscape = (target: EventTarget = document, init: KeyboardEventInit = {}) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init }))
  })
}

describe("MobileOverlayPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
  })

  test("closes on Escape", () => {
    const onClose = vi.fn()

    act(() => {
      root.render(
        <MobileOverlayPanel open title="Panel" onClose={onClose}>
          content
        </MobileOverlayPanel>,
      )
    })

    pressEscape()

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("leaves Escape to an active IME composition", () => {
    const onClose = vi.fn()

    act(() => {
      root.render(
        <MobileOverlayPanel open title="Panel" onClose={onClose}>
          content
        </MobileOverlayPanel>,
      )
    })

    pressEscape(document, { isComposing: true })

    const legacyEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    Object.defineProperty(legacyEvent, "keyCode", { value: 229 })
    act(() => {
      document.dispatchEvent(legacyEvent)
    })

    // Escape dismisses the composition's candidates; it must not close the panel.
    expect(onClose).not.toHaveBeenCalled()
  })

  test("closes only the topmost panel", () => {
    const parentClose = vi.fn()
    const childClose = vi.fn()

    act(() => {
      root.render(
        <MobileOverlayPanel open title="Parent" onClose={parentClose}>
          parent
        </MobileOverlayPanel>,
      )
    })
    act(() => {
      root.render(
        <>
          <MobileOverlayPanel open title="Parent" onClose={parentClose}>
            parent
          </MobileOverlayPanel>
          <MobileOverlayPanel open title="Child" onClose={childClose}>
            child
          </MobileOverlayPanel>
        </>,
      )
    })

    pressEscape()
    expect(childClose).toHaveBeenCalledTimes(1)
    expect(parentClose).not.toHaveBeenCalled()

    act(() => {
      root.render(
        <>
          <MobileOverlayPanel open title="Parent" onClose={parentClose}>
            parent
          </MobileOverlayPanel>
          <MobileOverlayPanel open={false} title="Child" onClose={childClose}>
            child
          </MobileOverlayPanel>
        </>,
      )
    })

    pressEscape()
    expect(parentClose).toHaveBeenCalledTimes(1)
  })

  test("lets an open nested popup consume Escape first", () => {
    const onClose = vi.fn()

    act(() => {
      root.render(
        <MobileOverlayPanel open title="Panel" onClose={onClose}>
          <div role="listbox">
            <span>option</span>
          </div>
        </MobileOverlayPanel>,
      )
    })

    const option = document.body.querySelector('[role="listbox"]')
    if (!option) throw new Error("listbox not rendered")

    pressEscape(option)
    expect(onClose).not.toHaveBeenCalled()

    pressEscape(document)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
