import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"

const { filesViewActive } = vi.hoisted(() => ({ filesViewActive: vi.fn<(active: boolean | undefined) => void>() }))

vi.mock("@/components/views/FilesView", () => ({
  FilesView: (props: { active?: boolean }) => {
    filesViewActive(props.active)
    return <div data-testid="files-view" />
  },
}))
vi.mock("@/contexts/useThemeSystem", () => {
  // The panel reads only the variant of the current theme while no embedded frame is mounted.
  const currentTheme = { metadata: { variant: "dark" } }
  const themeSystem = { themeMode: "dark", lightThemeId: "dark", darkThemeId: "dark", currentTheme }
  return { useThemeSystem: () => themeSystem, useOptionalThemeSystem: () => themeSystem }
})
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/hooks/useWebMcpBrowser", () => ({ useOpenProjectBrowser: () => vi.fn() }))

const { ContextPanel } = await import("./ContextPanel-impl")

const lastActive = () => filesViewActive.mock.calls.at(-1)?.[0]

describe("ContextPanel files view activity", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    // jsdom has no ResizeObserver; the panel observes its own width.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    filesViewActive.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  test("the editor-only files view is inactive while the panel is hidden under the session grid", async () => {
    act(() => {
      useUIStore.setState({ activeMainTab: "session-grid", browserPanel: { isOpen: false, url: "", focused: false } })
      useUIStore.getState().openContextPanelTab("/repo", { mode: "file", targetPath: "/repo/a.txt" })
    })
    await act(async () => {
      root.render(
        <I18nProvider>
          <ContextPanel />
        </I18nProvider>,
      )
    })
    // The files view is a lazy chunk; let it resolve.
    await act(async () => {
      await Promise.resolve()
    })
    expect(filesViewActive).toHaveBeenCalled()
    expect(lastActive()).toBe(false)

    await act(async () => {
      useUIStore.setState({ activeMainTab: "chat" })
    })
    expect(lastActive()).toBe(true)

    await act(async () => {
      useUIStore.setState({ activeMainTab: "session-grid" })
    })
    expect(lastActive()).toBe(false)
  })
})
