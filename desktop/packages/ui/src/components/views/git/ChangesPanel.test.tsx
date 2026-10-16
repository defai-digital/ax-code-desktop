import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { GitStatus } from "@/lib/api/types"
import { I18nProvider } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"

vi.doMock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }),
}))

const { ChangesPanel } = await import("./ChangesPanel")

const EXPANDED_ARIA = "Expand Directory  aria label"
const COLLAPSED_ARIA = "Collapse Directory  aria label"

const fileEntry = (path: string): GitStatus["files"][number] => ({ path, index: "M", working_dir: "M" })

const baseGroups = (entries: GitStatus["files"]) => [
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

describe("ChangesPanel auto-expand memory", () => {
  afterEach(() => {
    useUIStore.setState({ gitChangesViewMode: "tree" })
  })

  test("a directory collapsed in one repository does not stay collapsed in the next one", () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    const entries = [fileEntry("src/a.ts"), fileEntry("src/deep/b.ts")]

    const renderPanel = (scopeKey: string) => {
      act(() => {
        root.render(
          <I18nProvider>
            <ChangesPanel
              groups={baseGroups(entries)}
              scopeKey={scopeKey}
              diffStats={undefined}
              revertingPaths={new Set()}
            />
          </I18nProvider>,
        )
      })
    }

    try {
      useUIStore.setState({ gitChangesViewMode: "tree" })
      renderPanel("/repo-a")

      const directoryToggle = () =>
        Array.from(container.querySelectorAll("button")).find(
          (button) => button.getAttribute("aria-label") === COLLAPSED_ARIA || button.getAttribute("aria-label") === EXPANDED_ARIA,
        )

      // The first appearance auto-expands.
      expect(directoryToggle()?.getAttribute("aria-label")).toBe(COLLAPSED_ARIA)

      // The user collapses it in repo A.
      act(() => {
        directoryToggle()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      expect(directoryToggle()?.getAttribute("aria-label")).toBe(EXPANDED_ARIA)

      // Switching repositories must start from the auto-expanded state again — the
      // panel is reused across directory switches, and the seeded memory used to
      // carry the collapse into any repo with a same-named top-level folder.
      renderPanel("/repo-b")
      expect(directoryToggle()?.getAttribute("aria-label")).toBe(COLLAPSED_ARIA)

      // Within one repository the memory still works: collapse it here and a
      // status refresh must not undo it.
      act(() => {
        directoryToggle()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      expect(directoryToggle()?.getAttribute("aria-label")).toBe(EXPANDED_ARIA)

      renderPanel("/repo-b")
      expect(directoryToggle()?.getAttribute("aria-label")).toBe(EXPANDED_ARIA)
    } finally {
      act(() => root.unmount())
    }
  })
})
