import { describe, expect, test } from "vitest"
import { emptyAgentTeam, type AgentTeamModelRef } from "./agentTeam"
import { applyAgentTeamSuggestion, suggestAgentTeam, type AgentTeamCandidate } from "./agentTeamSuggest"

function candidate(providerID: string, modelID: string, extra: Partial<AgentTeamCandidate> = {}): AgentTeamCandidate {
  return { providerID, modelID, toolCall: true, reasoning: false, unavailable: false, ...extra }
}

const ref = (providerID: string, modelID: string): AgentTeamModelRef => ({ providerID, modelID })
const ids = (models: readonly AgentTeamModelRef[]) => models.map((model) => `${model.providerID}/${model.modelID}`)

const CATALOG = [
  candidate("kimi", "k3"),
  candidate("kimi", "k2"),
  candidate("grok", "g47"),
  candidate("grok", "g46"),
  candidate("zhipu", "glm"),
  candidate("deepseek", "v4"),
]

describe("suggestAgentTeam", () => {
  test("coders follow the user's favorites, and the second prefers another provider", () => {
    const suggestion = suggestAgentTeam({
      candidates: CATALOG,
      favorites: [ref("kimi", "k3"), ref("kimi", "k2"), ref("zhipu", "glm")],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["kimi/k3", "zhipu/glm"])
    expect(suggestion.coder.map((model) => model.reason)).toEqual(["favorite", "favorite"])
  })

  test("recently used models come after favorites and before the rest", () => {
    const suggestion = suggestAgentTeam({
      candidates: CATALOG,
      favorites: [ref("grok", "g46")],
      recents: [ref("deepseek", "v4")],
    })

    expect(ids(suggestion.coder)).toEqual(["grok/g46", "deepseek/v4"])
    expect(suggestion.coder.map((model) => model.reason)).toEqual(["favorite", "recent"])
  })

  test("with no history the composer model leads and the reason says why each was picked", () => {
    const suggestion = suggestAgentTeam({ candidates: CATALOG, favorites: [], recents: [], lead: ref("zhipu", "glm") })

    expect(ids(suggestion.coder)).toEqual(["zhipu/glm", "deepseek/v4"])
    expect(suggestion.coder.map((model) => model.reason)).toEqual(["lead", "otherProvider"])
  })

  test("a coder must support tool calling and be available", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("kimi", "k3", { toolCall: false }),
        candidate("grok", "g47", { unavailable: true }),
        candidate("zhipu", "glm"),
      ],
      favorites: [ref("kimi", "k3"), ref("grok", "g47")],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["zhipu/glm"])
  })

  test("QA never includes a coder, spreads across providers, and stops at council's default of three", () => {
    const suggestion = suggestAgentTeam({
      candidates: CATALOG,
      favorites: [ref("kimi", "k3"), ref("grok", "g47")],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["kimi/k3", "grok/g47"])
    expect(suggestion.qa).toHaveLength(3)
    expect(ids(suggestion.qa)).not.toContain("kimi/k3")
    expect(ids(suggestion.qa)).not.toContain("grok/g47")
    // deepseek and zhipu have no seat yet, so they are seated before a second kimi or grok model.
    expect(ids(suggestion.qa).slice(0, 2).sort()).toEqual(["deepseek/v4", "zhipu/glm"])
    // A reviewer from a provider that wrote none of the code says so; one from a coder's provider does not.
    expect(suggestion.qa.map((model) => model.reason)).toEqual(["otherProvider", "otherProvider", "available"])
  })

  test("the same model behind another provider is not suggested as its own reviewer", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("kimi", "k3"),
        candidate("gateway", "k3"),
        candidate("zhipu", "glm"),
        candidate("grok", "g47", { toolCall: false }),
        candidate("deepseek", "v4", { toolCall: false }),
      ],
      favorites: [ref("kimi", "k3"), ref("zhipu", "glm")],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["kimi/k3", "zhipu/glm"])
    expect(ids(suggestion.qa).sort()).toEqual(["deepseek/v4", "grok/g47"])
  })

  test("QA is not suggested when fewer than two reviewers remain", () => {
    const suggestion = suggestAgentTeam({
      candidates: [candidate("kimi", "k3"), candidate("grok", "g47"), candidate("zhipu", "glm")],
      favorites: [],
      recents: [],
    })

    expect(suggestion.coder).toHaveLength(2)
    expect(suggestion.qa).toEqual([])
  })

  test("with no coder available the composer model is the author and is kept out of QA", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("kimi", "k3", { toolCall: false }),
        candidate("grok", "g47", { toolCall: false }),
        candidate("zhipu", "glm", { toolCall: false }),
      ],
      favorites: [],
      recents: [],
      lead: ref("kimi", "k3"),
    })

    expect(suggestion.coder).toEqual([])
    expect(ids(suggestion.qa).sort()).toEqual(["grok/g47", "zhipu/glm"])
  })

  test("the same input always gives the same suggestion, whatever the catalog order", () => {
    const input = { favorites: [], recents: [], lead: null }
    const forward = suggestAgentTeam({ ...input, candidates: CATALOG })
    const reversed = suggestAgentTeam({ ...input, candidates: [...CATALOG].reverse() })

    expect(reversed).toEqual(forward)
  })

  test("an empty catalog suggests nothing", () => {
    expect(suggestAgentTeam({ candidates: [], favorites: [], recents: [] })).toEqual({ coder: [], qa: [] })
  })
})

describe("applyAgentTeamSuggestion", () => {
  test("turns both roles on with the suggested models", () => {
    const suggestion = suggestAgentTeam({ candidates: CATALOG, favorites: [ref("kimi", "k3")], recents: [] })
    const team = applyAgentTeamSuggestion(emptyAgentTeam(), suggestion)

    expect(team.coder.enabled).toBe(true)
    expect(team.coder.models).toEqual(suggestion.coder.map(({ providerID, modelID }) => ({ providerID, modelID })))
    expect(team.qa.enabled).toBe(true)
    expect(team.qa.models).toHaveLength(3)
  })

  test("a role with nothing to suggest keeps the user's own selection", () => {
    const current = { ...emptyAgentTeam(), qa: { enabled: true, models: [ref("a", "x"), ref("b", "y")] } }
    const team = applyAgentTeamSuggestion(current, {
      coder: [{ ...ref("kimi", "k3"), reason: "favorite" }],
      qa: [],
    })

    expect(team.coder.models).toEqual([ref("kimi", "k3")])
    expect(team.qa).toBe(current.qa)
  })
})
