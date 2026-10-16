import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"

const statFile = vi.fn()

vi.doMock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ files: { statFile } }) }))
vi.doMock("@/hooks/useChatSearchDirectory", () => ({ useChatSearchDirectory: () => "/repo" }))

const { FileMentionAutocomplete } = await import("./FileMentionAutocomplete")
const { useFilesViewTabsStore } = await import("@/stores/useFilesViewTabsStore")
const { useAgentsStore } = await import("@/stores/useAgentsStore")
const { useFileSearchStore } = await import("@/stores/useFileSearchStore")

const ROOT = "/repo"
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")

describe("FileMentionAutocomplete recent files", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() =>
      root.render(
        <I18nProvider>
          <FileMentionAutocomplete searchQuery="" onFileSelect={vi.fn()} onClose={vi.fn()} />
        </I18nProvider>,
      ),
    )
  }

  const flush = () => act(async () => {})

  const recentLabels = () =>
    Array.from(container.querySelectorAll("[aria-label]"))
      .map((element) => element.getAttribute("aria-label") ?? "")
      .filter((label) => label.length > 0)

  beforeEach(() => {
    statFile.mockReset()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useFilesViewTabsStore.setState({ byRoot: {} })
    useAgentsStore.setState({ agents: [] })
    useFileSearchStore.setState({ searchFiles: vi.fn(async () => []) })
    useFilesViewTabsStore.getState().addOpenPath(ROOT, `${ROOT}/gone.ts`)
    useFilesViewTabsStore.getState().addOpenPath(ROOT, `${ROOT}/kept.ts`)
    useFilesViewTabsStore.getState().setSelectedPath(ROOT, `${ROOT}/kept.ts`)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test("offers a recent file whose path is still there", async () => {
    statFile.mockImplementation(async (path: string) => ({ isFile: true, path, size: 1 }))
    render()
    await flush()

    expect(recentLabels()).toContain("gone.ts")
    expect(recentLabels()).toContain("kept.ts")
  })

  test("drops a recent file whose path is gone and closes its unselected tab", async () => {
    statFile.mockImplementation(async (path: string) =>
      path === `${ROOT}/gone.ts` ? { isFile: false, path, size: 0 } : { isFile: true, path, size: 1 },
    )
    render()
    await flush()

    expect(recentLabels()).not.toContain("gone.ts")
    expect(recentLabels()).toContain("kept.ts")
    expect(useFilesViewTabsStore.getState().byRoot[ROOT]?.openPaths).toEqual([`${ROOT}/kept.ts`])
  })

  test("drops a gone file that is the one on screen, without closing its tab", async () => {
    useFilesViewTabsStore.getState().setSelectedPath(ROOT, `${ROOT}/gone.ts`)
    statFile.mockImplementation(async (path: string) =>
      path === `${ROOT}/gone.ts` ? { isFile: false, path, size: 0 } : { isFile: true, path, size: 1 },
    )
    render()
    await flush()

    expect(recentLabels()).not.toContain("gone.ts")
    expect(recentLabels()).toContain("kept.ts")
    const rootTabs = useFilesViewTabsStore.getState().byRoot[ROOT]
    expect(rootTabs?.openPaths).toEqual([`${ROOT}/gone.ts`, `${ROOT}/kept.ts`])
    expect(rootTabs?.selectedPath).toBe(`${ROOT}/gone.ts`)
  })

  test("keeps a recent file whose stat fails for a reason other than being gone", async () => {
    statFile.mockImplementation(async (path: string) => {
      if (path === `${ROOT}/gone.ts`) {
        throw new Error("EACCES: permission denied")
      }
      return { isFile: true, path, size: 1 }
    })
    render()
    await flush()

    expect(recentLabels()).toContain("gone.ts")
  })
})
