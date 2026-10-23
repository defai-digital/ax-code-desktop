import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useConfigStore } from "@/stores/useConfigStore"
import { useAgentsStore } from "@/stores/useAgentsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSelectionStore } from "@/sync/selection-store"
import type { ProviderWithModelList } from "@/types/providerModels"

const messages = [
  {
    id: "msg-2",
    role: "user",
    agent: "plan",
    modelOrigin: "agent",
    model: { providerID: "test", modelID: "routed" },
  },
]
const sync = { isLoading: () => false, ensureSessionRenderable: vi.fn() }
vi.doMock("@/sync/sync-context", () => ({
  useDirectorySync: () => true,
  useSessionMessages: () => messages,
}))
vi.doMock("@/sync/use-sync", () => ({ useSync: () => sync }))
vi.doMock("./UsageIndicator", () => ({ UsageIndicator: () => null }))
vi.doMock("@/lib/i18n", async () => ({
  ...(await vi.importActual("@/lib/i18n")),
  useI18n: () => ({ t: (key: string) => key, formatLocale: "en" }),
}))
const { ModelControls } = await import("./ModelControls")

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  useConfigStore.setState({
    providers: [
      {
        id: "test",
        name: "Test",
        models: [
          { id: "picked", name: "Picked" },
          { id: "routed", name: "Routed" },
        ],
      },
    ] as unknown as ProviderWithModelList[],
    currentProviderId: "test",
    currentModelId: "picked",
    currentAgentName: "build",
    isInitialized: true,
  })
  useAgentsStore.setState({
    agents: [
      { name: "build", mode: "primary" },
      { name: "plan", mode: "primary" },
    ] as never,
  })
  useSessionUIStore.setState({ currentSessionId: "session-imported" })
  useSelectionStore.setState({
    hasHydrated: true,
    sessionAgentSelections: new Map(),
    sessionModelSelections: new Map(),
    sessionAgentModelSelections: new Map(),
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

test("adopts the loaded session's agent without replacing the picked model with a runtime route", async () => {
  await act(async () => {
    root.render(<ModelControls />)
  })
  expect(useConfigStore.getState().currentAgentName).toBe("plan")
  expect(useSelectionStore.getState().getSessionAgentSelection("session-imported")).toBe("plan")
  expect(useConfigStore.getState().currentModelId).toBe("picked")
})

test("a later manual agent switch does not rewrite the previous agent's model memory", async () => {
  useSelectionStore.getState().saveSessionModelSelection("session-imported", "test", "picked")
  await act(async () => {
    root.render(<ModelControls />)
  })
  const priorPlan = useSelectionStore.getState().getAgentModelForSession("session-imported", "plan")
  await act(async () => {
    useSelectionStore.getState().saveSessionAgentSelection("session-imported", "build")
    useSelectionStore.getState().saveSessionModelSelection("session-imported", "test", "routed")
    useConfigStore.getState().setAgent("build", { preserveModel: true })
  })
  expect(useSelectionStore.getState().getAgentModelForSession("session-imported", "plan")).toEqual(priorPlan)
  expect(useConfigStore.getState().currentAgentName).toBe("build")
})

test("a manual agent switch restores that agent's model without stamping the prior session pick over it", async () => {
  useSelectionStore.getState().saveSessionModelSelection("session-imported", "test", "picked")
  useSelectionStore.getState().saveAgentModelForSession("session-imported", "build", "test", "routed")
  await act(async () => {
    root.render(<ModelControls />)
  })
  expect(useConfigStore.getState().currentModelId).toBe("picked")
  await act(async () => {
    useSelectionStore.getState().saveSessionAgentSelection("session-imported", "build")
    useConfigStore.getState().setAgent("build")
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
  expect(useSelectionStore.getState().getAgentModelForSession("session-imported", "build")?.modelId).toBe("routed")
  expect(useConfigStore.getState().currentModelId).toBe("routed")
})

test("mounting with the routed turn's agent retains the session pick after the agent-switch delay", async () => {
  useConfigStore.setState({ currentAgentName: "plan" })
  useSelectionStore.getState().saveSessionModelSelection("session-imported", "test", "picked")
  useSelectionStore.getState().saveAgentModelForSession("session-imported", "plan", "test", "routed")
  await act(async () => {
    root.render(<ModelControls />)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
  expect(useConfigStore.getState().currentModelId).toBe("picked")
  expect(useSelectionStore.getState().getSessionModelSelection("session-imported")?.modelId).toBe("picked")
  expect(useSelectionStore.getState().getAgentModelForSession("session-imported", "plan")?.modelId).toBe("routed")
})
