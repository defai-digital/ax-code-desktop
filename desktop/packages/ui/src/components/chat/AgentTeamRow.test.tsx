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
  modelsMetadata: new Map(),
}))

const ui = vi.hoisted(() => {
  const state = {
    hiddenModels: [{ providerID: "zhipu", modelID: "glm-air" }],
    favoriteModels: [] as Array<{ providerID: string; modelID: string }>,
    recentModels: [] as Array<{ providerID: string; modelID: string }>,
    toggleFavoriteModel: (providerID: string, modelID: string) => {
      state.favoriteModels = [{ providerID, modelID }]
    },
    isFavoriteModel: (providerID: string, modelID: string) =>
      state.favoriteModels.some((entry) => entry.providerID === providerID && entry.modelID === modelID),
  }
  return state
})

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
  useConfigStore: Object.assign((selector: (state: typeof config) => unknown) => selector(config), {
    getState: () => config,
  }),
}))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: (selector: (state: typeof ui) => unknown) => selector(ui),
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
    ui.favoriteModels = []
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
  const options = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
  const option = (name: string) => options().find((entry) => entry.textContent?.includes(name))!

  test("both roles start unticked and show their limits", () => {
    render()

    expect(checkbox("coder").getAttribute("aria-checked")).toBe("false")
    expect(checkbox("qa").getAttribute("aria-checked")).toBe("false")
    expect(roleElement("coder").textContent).toContain('chat.agentTeam.upTo {"max":2}')
    expect(roleElement("qa").textContent).toContain('chat.agentTeam.upTo {"max":4}')
    expect(container.querySelector("[data-agent-team-hint]")).toBeNull()
  })

  test("ticking a role with no models opens the picker instead of turning it on", () => {
    render()

    act(() => checkbox("coder").click())

    expect(team().coder.enabled).toBe(false)
    expect(checkbox("coder").getAttribute("aria-checked")).toBe("false")
    expect(options().map((option) => option.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Kimi-K3"), expect.stringContaining("GLM-5.2")]),
    )
    // Hidden models are not offered.
    expect(document.body.textContent).not.toContain("GLM-Air")
  })

  test("picking models in the menu selects them, and the limit disables the rest", () => {
    render()
    act(() => checkbox("coder").click())

    act(() => option("Kimi-K3").click())
    expect(team().coder).toEqual({ enabled: true, models: [KIMI] })
    expect(option("GLM-5.2").getAttribute("aria-disabled")).toBeNull()

    act(() => option("GLM-5.2").click())
    expect(team().coder.models).toEqual([KIMI, GLM])
    expect(option("Qwen3.8-27b").getAttribute("aria-disabled")).toBe("true")
    expect(option("Kimi-K3").getAttribute("aria-selected")).toBe("true")
    expect(option("Qwen3.8-27b").getAttribute("aria-selected")).toBe("false")
    expect(document.body.textContent).toContain("chat.agentTeam.limitReached")

    act(() => option("Qwen3.8-27b").click())
    expect(team().coder.models).toEqual([KIMI, GLM])

    // A selected model stays clickable so it can be swapped out.
    act(() => option("Kimi-K3").click())
    expect(team().coder.models).toEqual([GLM])
  })

  test("a model can be starred from the menu without selecting it", () => {
    render()
    act(() => checkbox("qa").click())

    const star = option("Kimi-K3").querySelector<HTMLButtonElement>(".model-favorite-button")!
    act(() => star.click())

    expect(ui.favoriteModels).toEqual([KIMI])
    expect(team().qa.models).toEqual([])
  })

  test("a selected role shows one model name, how many more, and what the send will do", () => {
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    render()

    expect(checkbox("coder").getAttribute("aria-checked")).toBe("true")
    expect(roleElement("coder").textContent).toContain("Kimi-K3")
    expect(roleElement("coder").textContent).not.toContain("+")
    expect(container.querySelector("[data-agent-team-hint]")!.textContent).toContain(
      'chat.agentTeam.hint.coderSingle {"model":"Kimi-K3"}',
    )

    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", GLM))
    expect(roleElement("coder").textContent).toContain("Kimi-K3")
    expect(roleElement("coder").textContent).not.toContain("GLM-5.2")
    expect(roleElement("coder").textContent).toContain("+1")
    expect(container.querySelector("[data-agent-team-hint]")!.textContent).toContain(
      'chat.agentTeam.hint.extraModels {"count":2}',
    )
  })

  test("a model past the limit can still be starred", () => {
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", GLM))
    render()
    act(() => roleElement("coder").querySelectorAll<HTMLButtonElement>("button")[1]!.click())

    const star = option("Qwen3.8-27b").querySelector<HTMLButtonElement>(".model-favorite-button")!
    expect(star.disabled).toBe(false)
    act(() => star.click())

    expect(ui.favoriteModels).toEqual([QWEN])
    expect(team().coder.models).toEqual([KIMI, GLM])
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
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "qa", GLM))
    render()

    const hint = () => container.querySelector<HTMLElement>("[data-agent-team-hint]")!
    expect(hint().dataset.warning).toBe("true")
    expect(hint().getAttribute("aria-label")).toContain("chat.agentTeam.selfReview")

    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    expect(hint().dataset.warning).toBeUndefined()
  })

  test("a single QA model is flagged as not enough to run", () => {
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "qa", GLM))
    render()

    const hint = () => container.querySelector<HTMLElement>("[data-agent-team-hint]")!
    expect(roleElement("qa").dataset.incomplete).toBe("true")
    expect(roleElement("qa").textContent).toContain('chat.agentTeam.needsMore {"min":2}')
    expect(hint().dataset.warning).toBe("true")
    expect(hint().textContent).toContain('chat.agentTeam.hint.qaNeedsMore {"min":2}')

    act(() => useAgentTeamStore.getState().toggleModel("/repo", "qa", KIMI))
    expect(roleElement("qa").dataset.incomplete).toBeUndefined()
    expect(roleElement("qa").textContent).not.toContain("chat.agentTeam.needsMore")
    expect(hint().textContent).toContain('chat.agentTeam.hint.extraModels {"count":2}')
  })

  test("a fourth QA model warns that council's default member limit is three", () => {
    for (const model of [KIMI, GLM, QWEN, { providerID: "zhipu", modelID: "glm-air" }]) {
      act(() => useAgentTeamStore.getState().toggleModel("/repo", "qa", model))
    }
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", KIMI))
    act(() => useAgentTeamStore.getState().toggleModel("/repo", "coder", GLM))
    render()

    const hint = container.querySelector<HTMLElement>("[data-agent-team-hint]")!
    expect(hint.dataset.warning).toBe("true")
    expect(hint.getAttribute("aria-label")).toContain('chat.agentTeam.hint.qaMemberLimit {"limit":3}')

    act(() => roleElement("qa").querySelectorAll<HTMLButtonElement>("button")[1]!.click())
    expect(document.body.textContent).toContain('chat.agentTeam.hint.qaMemberLimit {"limit":3}')
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
