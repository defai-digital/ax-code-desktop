import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { useActivityRowGlide } from "./useActivityRowGlide"

type Props = { hiddenRows: number; active: boolean; rowsKey: number; text: string }

const Harness = ({ hiddenRows, active, rowsKey, text }: Props) => {
  const ref = React.useRef<HTMLDivElement>(null)
  useActivityRowGlide(ref, hiddenRows, active, rowsKey)
  return (
    <div ref={ref}>
      <div>first</div>
      <div>{text}</div>
    </div>
  )
}

describe("useActivityRowGlide", () => {
  let container: HTMLDivElement
  let root: Root
  let rectReads: number
  let rectSpy: ReturnType<typeof vi.spyOn>

  const render = (props: Props) => React.act(() => root.render(<Harness {...props} />))

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    rectReads = 0
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => {
      rectReads += 1
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
    rectSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  test("a streamed token that changes neither the row structure nor the trim does not read layout", () => {
    render({ hiddenRows: 0, active: true, rowsKey: 2, text: "a" })
    const afterMount = rectReads
    expect(afterMount).toBeGreaterThan(0)

    for (let i = 0; i < 5; i += 1) render({ hiddenRows: 0, active: true, rowsKey: 2, text: `a${"b".repeat(i)}` })

    expect(rectReads).toBe(afterMount)
  })

  test("a new row, a changed trim or a toggled glide still measures", () => {
    render({ hiddenRows: 0, active: true, rowsKey: 2, text: "a" })
    let seen = rectReads

    render({ hiddenRows: 0, active: true, rowsKey: 3, text: "a" })
    expect(rectReads).toBeGreaterThan(seen)
    seen = rectReads

    render({ hiddenRows: 1, active: true, rowsKey: 3, text: "a" })
    expect(rectReads).toBeGreaterThan(seen)
    seen = rectReads

    render({ hiddenRows: 1, active: false, rowsKey: 3, text: "a" })
    expect(rectReads).toBeGreaterThan(seen)
  })
})
