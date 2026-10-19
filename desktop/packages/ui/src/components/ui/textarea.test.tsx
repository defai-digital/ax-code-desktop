import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { Textarea, resolveTextareaResizeFloor } from "./textarea"

describe("resolveTextareaResizeFloor", () => {
  test("keeps the 82px fallback when there is no textarea", () => {
    expect(resolveTextareaResizeFloor(document.createElement("div"))).toBe(82)
  })

  test("adds the textarea min-height, footer, row gap and wrapper padding", () => {
    const wrapper = document.createElement("div")
    wrapper.style.paddingTop = "2px"
    wrapper.style.paddingBottom = "10px"

    const row = document.createElement("div")
    row.style.rowGap = "8px"

    const textarea = document.createElement("textarea")
    textarea.style.minHeight = "160px"

    const footer = document.createElement("div")
    footer.getBoundingClientRect = () => ({ height: 32 }) as DOMRect

    row.append(textarea, footer)
    wrapper.append(row)

    expect(resolveTextareaResizeFloor(wrapper)).toBe(160 + 32 + 8 + 2 + 10)
  })
})

describe("Textarea resize drag", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // jsdom has no pointer capture.
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} })
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
  })

  test("clamps an upward drag to the computed floor instead of 82px", async () => {
    const onResizeHeightChange = vi.fn()

    act(() => {
      root.render(
        <I18nProvider>
          <Textarea onResizeHeightChange={onResizeHeightChange} style={{ minHeight: "320px" }} />
        </I18nProvider>,
      )
    })

    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    const textarea = container.querySelector("textarea")
    const row = textarea?.parentElement
    const wrapper = row?.parentElement
    const footer = textarea?.nextElementSibling
    if (!separator || !textarea || !row || !wrapper || !footer) {
      throw new Error("textarea chrome not rendered")
    }

    row.style.rowGap = "8px"
    wrapper.style.paddingTop = "2px"
    wrapper.style.paddingBottom = "10px"
    footer.getBoundingClientRect = () => ({ height: 12 }) as DOMRect
    wrapper.getBoundingClientRect = () => ({ height: 400 }) as DOMRect

    await act(async () => {
      separator.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }))
      separator.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: -100 }))
    })

    // A 200px upward drag would leave 200px: below 320 + 12 + 8 + 2 + 10.
    expect(onResizeHeightChange).toHaveBeenLastCalledWith(352)
  })
})
