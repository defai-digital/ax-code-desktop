import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const stubStore = <State extends object>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/sync/sync-context", () => ({ useSession: () => ({}) }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: stubStore({
    currentSessionId: "ses_1",
    getContextUsage: (contextLimit: number, outputLimit: number) => ({
      totalTokens: contextLimit / 2,
      percentage: contextLimit === 2000 ? 25 : 50,
      contextLimit,
      outputLimit,
    }),
  }),
}))
const surface = vi.hoisted(() => ({ mode: "default" as "default" | "main-window" | "mini-chat" }))
vi.mock("@/components/chat/useChatSurfaceMode", () => ({ useChatSurfaceMode: () => surface.mode }))
vi.mock("@/components/ui/tooltip", async () => {
  const React = await import("react")
  const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  return { Tooltip: Passthrough, TooltipTrigger: Passthrough, TooltipContent: () => null }
})
vi.mock("@/stores/useConfigStore", async () => {
  const { create } = await import("zustand")
  const useConfigStore = create(() => ({
    currentProviderId: "p1",
    currentModelId: "m1",
    providers: [
      {
        id: "p1",
        name: "Provider",
        models: [
          { id: "m1", limit: { context: 1000, output: 100 } },
          { id: "m2", limit: { context: 2000, output: 200 } },
        ],
      },
    ],
    getCurrentModel: () => {
      const state = useConfigStore.getState()
      const provider = state.providers.find((entry) => entry.id === state.currentProviderId)
      return provider?.models.find((model) => model.id === state.currentModelId)
    },
  }))
  return { useConfigStore }
})

import { useConfigStore } from "@/stores/useConfigStore"
import { useUIStore } from "@/stores/useUIStore"

const { UsageIndicator } = await import("./UsageIndicator")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe("UsageIndicator model changes", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    surface.mode = "default"
    useConfigStore.setState({ currentProviderId: "p1", currentModelId: "m1" })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("re-renders with the new context limit when the model changes while idle", () => {
    act(() => {
      root.render(<UsageIndicator />)
    })
    expect(container.textContent).toContain("50.0%")

    act(() => {
      useConfigStore.setState({ currentModelId: "m2" })
    })

    expect(container.textContent).toContain("25.0%")
  })

  test("shows the percentage in the main window and hides the duplicate in mini chat", () => {
    surface.mode = "main-window"
    act(() => {
      root.render(<UsageIndicator />)
    })
    expect(container.textContent).toContain("50.0%")

    surface.mode = "mini-chat"
    act(() => root.unmount())
    root = createRoot(container)
    act(() => {
      root.render(<UsageIndicator />)
    })
    expect(container.textContent ?? "").not.toContain("%")
  })

  test("the percentage button opens and closes the context breakdown", () => {
    useUIStore.setState({
      isMobile: false,
      splitPaneEnabled: false,
      splitPaneRightTab: "files",
      activeMainTab: "chat",
      mainTabGuard: null,
    })
    act(() => {
      root.render(<UsageIndicator />)
    })
    const button = container.querySelector("button")
    expect(button?.getAttribute("aria-pressed")).toBe("false")
    act(() => {
      button?.click()
    })
    expect(useUIStore.getState().splitPaneEnabled).toBe(true)
    expect(useUIStore.getState().splitPaneRightTab).toBe("context")
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("true")
    act(() => {
      container.querySelector("button")?.click()
    })
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
  })
})
