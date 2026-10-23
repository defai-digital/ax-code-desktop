import { describe, expect, test } from "vitest"

import { shouldStartWindowDrag } from "./windowDrag"

const element = (html: string) => {
  const host = document.createElement("div")
  host.innerHTML = html
  return host.firstElementChild as Element
}

describe("shouldStartWindowDrag", () => {
  test("starts a drag from plain title bar space with the primary button", () => {
    expect(shouldStartWindowDrag(element("<span></span>"), 0)).toBe(true)
  })

  test("does not start one for other buttons", () => {
    expect(shouldStartWindowDrag(element("<span></span>"), 2)).toBe(false)
  })

  test("leaves controls and no-drag regions to their own click", () => {
    expect(shouldStartWindowDrag(element("<button><span></span></button>"), 0)).toBe(false)
    expect(shouldStartWindowDrag(element('<div class="app-region-no-drag"><span></span></div>'), 0)).toBe(false)
    expect(shouldStartWindowDrag(element('<div class="app-region-no-drag"></div>').firstElementChild ?? element('<div class="app-region-no-drag"></div>'), 0)).toBe(false)
  })
})
