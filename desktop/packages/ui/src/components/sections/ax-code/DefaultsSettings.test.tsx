import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const { updateDesktopSettings } = vi.hoisted(() => ({
  updateDesktopSettings: vi.fn<(changes: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock("@/lib/persistence", () => ({ updateDesktopSettings }))

const {
  setProvider,
  setModel,
  setSettingsDefaultModel,
  setSettingsDefaultVariant,
  setCurrentVariant,
  setSettingsDefaultFileViewerPreview,
} = vi.hoisted(() => ({
  setProvider: vi.fn(),
  setModel: vi.fn(),
  setSettingsDefaultModel: vi.fn(),
  setSettingsDefaultVariant: vi.fn(),
  setCurrentVariant: vi.fn(),
  setSettingsDefaultFileViewerPreview: vi.fn(),
}))

vi.mock("@/stores/useConfigStore", () => {
  const state = {
    providers: [
      { id: "defai", models: [{ id: "deepseek-flash", limit: { context: 1000, output: 100 } }] },
      { id: "claude-code", models: [{ id: "claude-sonnet", limit: { context: 1000, output: 100 } }] },
    ],
    settingsDefaultModel: undefined as string | undefined,
    settingsDefaultVariant: undefined as string | undefined,
    settingsDefaultAgent: undefined as string | undefined,
    settingsDefaultFileViewerPreview: false,
    settingsAutoCreateWorktree: false,
    settingsGitmojiEnabled: false,
    setProvider,
    setModel,
    setSettingsDefaultModel,
    setSettingsDefaultVariant,
    setCurrentVariant,
    setAgent: vi.fn(),
    setSettingsDefaultAgent: vi.fn(),
    setSettingsAutoCreateWorktree: vi.fn(),
    setSettingsGitmojiEnabled: vi.fn(),
    setSettingsDefaultFileViewerPreview,
  }
  const useConfigStore = ((selector?: (value: typeof state) => unknown) =>
    selector ? selector(state) : state) as unknown as {
    (selector?: (value: typeof state) => unknown): unknown
    getState: () => typeof state
  }
  useConfigStore.getState = () => state
  return { useConfigStore }
})

// The picker is a whole component tree; the settings row only needs its onChange.
const { modelSelectorOnChange } = vi.hoisted(() => ({
  modelSelectorOnChange: { current: null as null | ((providerId: string, modelId: string) => void) },
}))

vi.mock("@/components/sections/agents/ModelSelector", () => ({
  ModelSelector: ({ onChange }: { onChange: (providerId: string, modelId: string) => void }) => {
    modelSelectorOnChange.current = onChange
    return null
  },
}))

vi.mock("@/components/sections/commands/AgentSelector", () => ({ AgentSelector: () => null }))

const { DefaultsSettings } = await import("./DefaultsSettings")

describe("DefaultsSettings default model", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    updateDesktopSettings.mockClear()
    setSettingsDefaultModel.mockClear()
    setSettingsDefaultFileViewerPreview.mockClear()
    modelSelectorOnChange.current = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("keeps a saved variant while the provider list is still empty", async () => {
    // The effect that drops a variant the model no longer supports fired while the provider list was
    // still loading, where an empty list meant "not known yet": it persisted an empty defaultVariant
    // that the user could not get back.
    const { useConfigStore } = await import("@/stores/useConfigStore")
    const state = useConfigStore.getState() as unknown as { providers: unknown[] }
    const providers = state.providers
    state.providers = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ defaultModel: "defai/deepseek-flash", defaultVariant: "high" }),
      }) as unknown as Response) as typeof fetch

    try {
      await act(async () => {
        root.render(React.createElement(I18nProvider, null, React.createElement(DefaultsSettings)))
      })
      await act(async () => {})

      expect(updateDesktopSettings).not.toHaveBeenCalled()
    } finally {
      state.providers = providers
      globalThis.fetch = originalFetch
    }
  })

  test("saves the picked model with one settings write", async () => {
    // Regression: the handler also issued its own PUT for the same field, which
    // bypassed the coalescing queue and the settings cache — two unordered writes
    // for one value could lose a later change, and a following read could still
    // serve the pre-write snapshot.
    const requests: Array<{ url: string; method: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: String(init?.method ?? "GET").toUpperCase() })
      return { ok: true, json: async () => ({}) } as unknown as Response
    }) as typeof fetch

    try {
      // The form (and the picker) renders only after the defaults load resolves.
      await act(async () => {
        root.render(React.createElement(I18nProvider, null, React.createElement(DefaultsSettings)))
      })
      await act(async () => {})
      expect(typeof modelSelectorOnChange.current).toBe("function")

      await act(async () => {
        modelSelectorOnChange.current?.("defai", "deepseek-flash")
      })

      expect(setSettingsDefaultModel).toHaveBeenCalledWith("defai/deepseek-flash")
      expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
      expect(updateDesktopSettings.mock.calls[0][0]).toEqual({
        defaultModel: "defai/deepseek-flash",
        defaultVariant: "",
      })
      // The component's own defaults load is a GET; the handler must not add a PUT of
      // its own next to the queued write.
      expect(requests.filter((request) => request.method === "PUT")).toEqual([])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  const renderDefaults = async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as typeof fetch
    try {
      await act(async () => {
        root.render(React.createElement(I18nProvider, null, React.createElement(DefaultsSettings)))
      })
      await act(async () => {})
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  const previewCheckbox = () => {
    const checkboxes = container.querySelectorAll<HTMLElement>('[role="checkbox"]')
    if (checkboxes.length !== 2) throw new Error(`expected 2 checkboxes, found ${checkboxes.length}`)
    return checkboxes[1]
  }

  test("persists the preview default when the checkbox itself is clicked", async () => {
    // The checkbox sits inside a clickable row, and its own onChange only wrote
    // the in-memory store: the row click was the only persistence path. Stopping
    // propagation for in-row checkboxes made clicking the box itself revert on
    // restart while clicking the row text still worked.
    await renderDefaults()

    await act(async () => {
      previewCheckbox().click()
    })

    expect(setSettingsDefaultFileViewerPreview).toHaveBeenCalledTimes(1)
    expect(setSettingsDefaultFileViewerPreview).toHaveBeenCalledWith(true)
    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toEqual({ defaultFileViewerPreview: true })
  })

  test("persists the preview default once from keyboard activation", async () => {
    await renderDefaults()

    await act(async () => {
      const target = previewCheckbox()
      target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }))
      target.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }))
    })

    expect(setSettingsDefaultFileViewerPreview).toHaveBeenCalledTimes(1)
    expect(setSettingsDefaultFileViewerPreview).toHaveBeenCalledWith(true)
    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toEqual({ defaultFileViewerPreview: true })
  })

  test("still persists the preview default when the row text is clicked", async () => {
    await renderDefaults()

    const row = previewCheckbox().closest<HTMLElement>('[role="button"]')
    const label = row?.querySelector<HTMLElement>("span.typography-ui-label")
    if (!label) throw new Error("preview row label not rendered")

    await act(async () => {
      label.click()
    })

    expect(setSettingsDefaultFileViewerPreview).toHaveBeenCalledTimes(1)
    expect(setSettingsDefaultFileViewerPreview).toHaveBeenCalledWith(true)
    expect(updateDesktopSettings).toHaveBeenCalledTimes(1)
    expect(updateDesktopSettings.mock.calls[0][0]).toEqual({ defaultFileViewerPreview: true })
  })
})
