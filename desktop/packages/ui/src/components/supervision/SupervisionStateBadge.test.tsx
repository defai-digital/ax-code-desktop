import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))

import { SupervisionStateBadge } from "./SupervisionStateBadge"

describe("SupervisionStateBadge", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("goal has its own textual label and accessible name, not colour alone", () => {
    act(() => root.render(<SupervisionStateBadge state="goal" />))
    const badge = container.querySelector("[data-supervision-state='goal']")
    expect(badge?.textContent).toContain("supervision.state.goal")
    expect(badge?.getAttribute("aria-label")).toBe("supervision.state.goal")
  })

  test("goal does not reuse another state's label", () => {
    act(() => root.render(<SupervisionStateBadge state="goal" />))
    const badge = container.querySelector("[data-supervision-state='goal']")
    expect(badge?.textContent).not.toContain("supervision.state.error")
    expect(badge?.textContent).not.toContain("supervision.state.review")
  })
})
