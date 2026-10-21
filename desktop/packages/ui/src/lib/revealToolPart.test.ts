import { afterEach, describe, expect, test, vi } from "vitest"
import { revealToolPart } from "./revealToolPart"

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe("revealToolPart", () => {
  test("scrolls to the exact call, focuses its row and marks it briefly", () => {
    vi.useFakeTimers()
    const other = document.createElement("div")
    other.setAttribute("data-tool-part-id", "prt_other")
    const part = document.createElement("div")
    part.setAttribute("data-tool-part-id", 'prt_"quoted"')
    const row = document.createElement("div")
    row.setAttribute("role", "button")
    row.tabIndex = 0
    part.append(row)
    part.scrollIntoView = vi.fn()
    other.scrollIntoView = vi.fn()
    document.body.append(other, part)
    expect(revealToolPart('prt_"quoted"')).toBe(true)
    expect(part.scrollIntoView).toHaveBeenCalledWith({ block: "center" })
    expect(other.scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(row)
    expect(part.hasAttribute("data-attention")).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(part.hasAttribute("data-attention")).toBe(false)
  })

  test("a call that is not rendered is left alone", () => {
    expect(revealToolPart("missing")).toBe(false)
  })
})
