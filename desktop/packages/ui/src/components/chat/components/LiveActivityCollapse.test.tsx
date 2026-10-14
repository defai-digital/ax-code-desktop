import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createRoot, type Root } from "react-dom/client"
import { LiveActivityCollapse } from "./LiveActivityCollapse"

const animate = vi.hoisted(() =>
  vi.fn(() => ({
    finished: new Promise<void>(() => undefined),
    stop: vi.fn(),
  })),
)

vi.mock("motion", () => ({
  animate,
}))

const installMatchMedia = (reduce: boolean) => {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia })
}

describe("LiveActivityCollapse reduced motion", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    animate.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const renderCollapse = (expanded: boolean) => {
    act(() => {
      root.render(
        <LiveActivityCollapse expanded={expanded}>
          <div>Activity body</div>
        </LiveActivityCollapse>,
      )
    })
  }

  test("settles a collapse immediately when reduced motion is requested", () => {
    installMatchMedia(true)
    renderCollapse(true)
    expect(container.textContent).toContain("Activity body")

    renderCollapse(false)

    const region = container.querySelector<HTMLElement>("[data-live-activity-content]")
    expect(animate).not.toHaveBeenCalled()
    expect(region?.style.height).toBe("0px")
    expect(region?.style.overflow).toBe("hidden")
    expect(region?.getAttribute("aria-hidden")).toBe("true")
    expect(region?.hasAttribute("inert")).toBe(true)
    expect(region?.textContent).toBe("")
  })

  test("animates a collapse when motion is allowed", () => {
    installMatchMedia(false)
    renderCollapse(true)
    renderCollapse(false)

    const region = container.querySelector<HTMLElement>("[data-live-activity-content]")
    expect(animate).toHaveBeenCalledTimes(1)
    expect(region?.textContent).toContain("Activity body")
  })
})
