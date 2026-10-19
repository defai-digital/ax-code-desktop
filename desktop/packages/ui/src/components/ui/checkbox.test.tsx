import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { Checkbox } from "./checkbox"

describe("Checkbox", () => {
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

  const checkbox = () => {
    const element = container.querySelector<HTMLElement>('[role="checkbox"]')
    if (!element) throw new Error("checkbox not rendered")
    return element
  }

  test("toggles once without activating a clickable row around it", async () => {
    const onChange = vi.fn()
    const onRowClick = vi.fn()

    act(() => {
      root.render(
        <button type="button" onClick={onRowClick}>
          <Checkbox checked={false} onChange={onChange} ariaLabel="Option" />
        </button>,
      )
    })

    await act(async () => {
      checkbox().click()
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  test("still toggles from its own keyboard activation", async () => {
    const onChange = vi.fn()
    const onRowClick = vi.fn()

    act(() => {
      root.render(
        <button type="button" onClick={onRowClick}>
          <Checkbox checked={false} onChange={onChange} ariaLabel="Option" />
        </button>,
      )
    })

    await act(async () => {
      checkbox().dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }))
      checkbox().dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }))
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  test("keeps implicit label activation working", async () => {
    const onChange = vi.fn()

    act(() => {
      root.render(
        <label>
          Accept
          <Checkbox checked={false} onChange={onChange} ariaLabel="Accept" />
        </label>,
      )
    })

    const label = container.querySelector("label")
    if (!label) throw new Error("label not rendered")

    await act(async () => {
      label.click()
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
