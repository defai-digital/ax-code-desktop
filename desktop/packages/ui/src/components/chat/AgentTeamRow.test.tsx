import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const config = vi.hoisted(() => ({
  providers: [
    {
      id: "moonshot",
      name: "Moonshot",
      models: [{ id: "kimi", name: "Kimi-K3" }],
    },
    {
      id: "zhipu",
      name: "Zhipu",
      models: [
        { id: "glm", name: "GLM-5.2" },
        { id: "glm-air", name: "GLM-Air" },
      ],
    },
    {
      id: "alibaba",
      name: "Alibaba",
      models: [{ id: "qwen", name: "Qwen3.8-27b" }],
    },
  ],
  currentProviderId: "alibaba",
  currentModelId: "qwen",
}))

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (selector: (state: { currentDirectory: string }) => unknown) =>
    selector({ currentDirectory: "/repo" }),
}))
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: (selector: (state: typeof config) => unknown) => selector(config),
}))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: (selector: (state: { hiddenModels: Array<{ providerID: string; modelID: string }> }) => unknown) =>
    selector({ hiddenModels: [{ providerID: "zhipu", modelID: "glm-air" }] }),
}))

import { useAgentTeamStore } from "@/stores/useAgentTeamStore"
import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { AgentTeamRow } from "./AgentTeamRow"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const KIMI = { providerID: "moonshot", modelID: "kimi" }
const GLM = { providerID: "zhipu", modelID: "glm" }
const QWEN = { providerID: "alibaba", modelID: "qwen" }

describe("AgentTeamRow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useAgentTeamStore.setState({ teamByDirectory: {} })
    useWorkModeStore.setState({ modeByDirectory: {} })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (compact = false) =>
    act(() => {
      root.render(<AgentTeamRow compact={compact} />)
    })
  const roleElement = (role: "coder" | "qa") => container.querySelector<HTMLElement>(`[data-agent-team-role="${role}"]`)!
  const checkbox = (role: "coder" | "qa") => roleElement(role).querySelector<HTMLButtonElement>('[role="checkbox"]')!
  const team = () => useAgentTeamStore.getState().getTeam("/repo")

  test("both roles start unticked and show their limits", () => {
    render()

    expect(checkbox("coder").getAttribute("aria-checked")).toBe("false")
    expect(checkbox("qa").getAttribute("aria-checked")).toBe("false")
    expect(roleElement("coder").textContent).toContain('chat.agentTeam.upTo {"max":2}')
    expect(roleElement("qa").textContent).toContain('chat.agentTeam.upTo {"max":4}')
    expect(container.querySelector("[data-agent-team-hint]")).toBeNull()
  })

  test("ticking a role with no models does not turn it on", () => {
    render()

    act(() => checkbox("coder").click())

    expect(team().coder.enabled).toBe(false)
    expect(checkbox("coder").getAttribute("aria-checked")).toBe("false")
  })

  test("a selected role shows its models, its count and what the send will do", () => {
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    render()

    expect(checkbox("coder").getAttribute("aria-checked")).toBe("true")
    expect(roleElement("coder").textContent).toContain("Kimi-K3")
    expect(roleElement("coder").textContent).toContain("1/2")
    expect(container.querySelector("[data-agent-team-hint]")!.textContent).toContain(
      'chat.agentTeam.hint.coderSingle {"model":"Kimi-K3"}',
    )
  })

  test("unticking keeps the models and ticking again restores them", () => {
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "qa", GLM))
    render()

    act(() => checkbox("qa").click())
    expect(team().qa).toEqual({ enabled: false, models: [GLM] })
    expect(roleElement("qa").textContent).not.toContain("GLM-5.2")

    act(() => checkbox("qa").click())
    expect(team().qa.enabled).toBe(true)
    expect(roleElement("qa").textContent).toContain("GLM-5.2")
  })

  test("warns when a QA model reviews its own work", () => {
    // No coder is selected, so the composer model writes the code that it would then review.
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "qa", QWEN))
    render()

    expect(container.querySelector("[data-agent-team-hint]")!.textContent).toContain("chat.agentTeam.selfReview")

    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    expect(container.querySelector("[data-agent-team-hint]")!.textContent).not.toContain("chat.agentTeam.selfReview")
  })

  test("a narrow composer shows counts instead of names", () => {
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    render(true)

    expect(roleElement("coder").textContent).not.toContain("Kimi-K3")
    expect(roleElement("coder").textContent).toContain("1/2")
    expect(container.querySelector("[data-agent-team-hint]")).toBeNull()
  })

  test("is not offered in Council or Arena work mode", () => {
    act(() => useWorkModeStore.getState().setMode("/repo", "council"))
    render()

    expect(container.querySelector("[data-agent-team-row]")).toBeNull()
  })
})
