import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { GitStatus } from "@/lib/api/types"
import { I18nProvider } from "@/lib/i18n"

vi.doMock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }),
}))

const { ChangesPanel } = await import("./ChangesPanel")

const fileEntry = (path: string): GitStatus["files"][number] => ({ path, index: "M", working_dir: "M" })

const groups = (entries: GitStatus["files"]) => [
  {
    id: "unstaged",
    title: "Changes",
    entries,
    statsScope: "working" as const,
    actionSymbol: "+" as const,
    actionAllLabel: "Stage all",
    getActionLabel: () => "+",
    onActionFile: () => {},
    onActionAll: () => {},
    onViewDiff: () => {},
    onRevertFile: () => {},
  },
]

describe("ChangesPanel virtualization", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test("renders rows after the scroll element is measured", () => {
    // The virtual window is a function of the scroll offset and the measured viewport. A memo
    // whose deps never moved with either froze it at the first render - where the scroll
    // element is not attached yet, so it was empty - and a 1000+ change list then rendered no
    // rows at all inside a full-height scroll area.
    // A real ResizeObserver delivers an initial notification for every observed element; the
    // virtualizer relies on that (and on later observations) to measure the scroll element.
    // A silent stub left the virtual window empty after the library update.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private callback: ResizeObserverCallback
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback
        }
        observe(target: Element) {
          this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver)
        }
        unobserve() {}
        disconnect() {}
      },
    )
    // jsdom reports every element as zero-sized. The virtualizer reads the scroll element's
    // clientHeight/clientWidth for the viewport and each row's rect for its measured size.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({ width: 800, height: 34, top: 0, left: 0, right: 800, bottom: 34, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    )

    const entries = Array.from({ length: 1200 }, (_, index) => fileEntry(`src/f${index}.ts`))
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <I18nProvider>
            <ChangesPanel groups={groups(entries)} scopeKey="/repo" diffStats={undefined} revertingPaths={new Set()} />
          </I18nProvider>,
        )
      })

      expect(container.querySelectorAll("[data-index]").length).toBeGreaterThan(0)
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
