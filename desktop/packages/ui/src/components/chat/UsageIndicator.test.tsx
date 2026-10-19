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
vi.mock("@/components/chat/useChatSurfaceMode", () => ({ useChatSurfaceMode: () => "default" }))
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

const { UsageIndicator } = await import("./UsageIndicator")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe("UsageIndicator model changes", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
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
})
