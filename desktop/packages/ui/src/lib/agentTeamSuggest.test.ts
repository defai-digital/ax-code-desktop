import { describe, expect, test } from "vitest"
import {
  agentTeamBlockedReason,
  emptyAgentTeam,
  type AgentTeamCatalogProvider,
  type AgentTeamModelRef,
} from "./agentTeam"
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

  test("the second coder is never the first coder's model behind another provider", () => {
    const candidates = [candidate("claude-code", "opus"), candidate("anthropic", "opus"), candidate("zhipu", "glm")]
    const suggestion = suggestAgentTeam({ candidates, favorites: [ref("claude-code", "opus")], recents: [] })

    expect(ids(suggestion.coder)).toEqual(["claude-code/opus", "zhipu/glm"])
    // With no other model to compare against, one coder is suggested rather than the same model twice.
    const alone = suggestAgentTeam({ candidates: candidates.slice(0, 2), favorites: [], recents: [] })
    expect(alone.coder).toHaveLength(1)
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
    // The catalog does not state tool calling for the composer model, so it counts as capable and
    // can run council itself; the listed reviewers cannot be coders.
    const lead = ref("kimi", "k3")
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("kimi", "k3", { toolCall: undefined }),
        candidate("grok", "g47", { toolCall: false }),
        candidate("zhipu", "glm", { toolCall: false }),
      ],
      favorites: [],
      recents: [],
      lead,
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

describe("suggestions that can actually run", () => {
  // The catalog as the send sees it, so the invariant is checked with the production helper.
  const catalogOf = (candidates: readonly AgentTeamCandidate[]): AgentTeamCatalogProvider[] => {
    const byProvider = new Map<string, { id: string; models: Array<Record<string, unknown> & { id: string }> }>()
    for (const entry of candidates) {
      const provider = byProvider.get(entry.providerID) ?? { id: entry.providerID, models: [] }
      provider.models = [...provider.models, { id: entry.modelID, capabilities: { toolcall: entry.toolCall } }]
      byProvider.set(entry.providerID, provider)
    }
    return [...byProvider.values()]
  }

  const blockedReason = (candidates: readonly AgentTeamCandidate[], lead: AgentTeamModelRef) =>
    agentTeamBlockedReason(
      applyAgentTeamSuggestion(emptyAgentTeam(), suggestAgentTeam({ candidates, favorites: [], recents: [], lead })),
      lead,
      catalogOf(candidates),
    )

  // CLI models rank first and fill the arena and the panel; a tool-capable API model sits at the end.
  const CLI_HEAVY = [
    candidate("claude-code", "fable"),
    candidate("codex-cli", "codex"),
    candidate("dsh-cli", "dsh"),
    candidate("grok-build-cli", "grok"),
    candidate("kimi-cli", "k3"),
    candidate("zhipu", "glm"),
  ]
  const CLI_LEAD = ref("claude-code", "fable")

  test("a CLI lead gets a coder that can orchestrate instead of an all-CLI arena", () => {
    const suggestion = suggestAgentTeam({ candidates: CLI_HEAVY, favorites: [], recents: [], lead: CLI_LEAD })

    expect(ids(suggestion.coder)).toEqual(["claude-code/fable", "zhipu/glm"])
    expect(suggestion.qa.map((model) => model.providerID)).toEqual(["codex-cli", "dsh-cli", "grok-build-cli"])
    expect(blockedReason(CLI_HEAVY, CLI_LEAD)).toBeNull()
  })

  test("a non-CLI lead known to lack tool calling is treated the same way", () => {
    const candidates = [candidate("alibaba", "tiny", { toolCall: false }), ...CLI_HEAVY]
    const lead = ref("alibaba", "tiny")
    const suggestion = suggestAgentTeam({
      candidates,
      favorites: [ref("claude-code", "fable"), ref("codex-cli", "codex")],
      recents: [],
      lead,
    })

    expect(ids(suggestion.coder)).toEqual(["claude-code/fable", "zhipu/glm"])
    // The swapped-in coder is the author, so it cannot also review.
    expect(ids(suggestion.qa)).not.toContain("zhipu/glm")
    expect(blockedReason(candidates, lead)).toBeNull()
  })

  test("a single CLI coder gets no QA panel it could not orchestrate", () => {
    const candidates = [
      candidate("claude-code", "fable"),
      candidate("zhipu", "glm", { toolCall: false }),
      candidate("deepseek", "v4", { toolCall: false }),
    ]
    const suggestion = suggestAgentTeam({ candidates, favorites: [], recents: [], lead: CLI_LEAD })

    expect(ids(suggestion.coder)).toEqual(["claude-code/fable"])
    expect(suggestion.qa).toEqual([])
    expect(blockedReason(candidates, CLI_LEAD)).toBeNull()
  })

  test("with nothing that can orchestrate, the top coder runs alone and the panel is left out with its reason", () => {
    const candidates = [
      candidate("claude-code", "fable"),
      candidate("codex-cli", "codex"),
      candidate("dsh-cli", "dsh"),
      candidate("kimi-cli", "k3"),
    ]
    const suggestion = suggestAgentTeam({ candidates, favorites: [], recents: [], lead: CLI_LEAD })

    // No arena and no council can run, but one coder is an ordinary turn on that model.
    expect(ids(suggestion.coder)).toEqual(["claude-code/fable"])
    expect(suggestion.qa).toEqual([])
    expect(suggestion.qaSkipped).toBe("coderCannotRunQa")
    expect(blockedReason(candidates, CLI_LEAD)).toBeNull()
  })

  test("a favorite CLI coder is kept and its panel dropped, rather than the coder being replaced", () => {
    // One model can code. It cannot run a council, and nothing else may take its place as coder.
    const candidates = [
      candidate("claude-code", "fable"),
      candidate("zhipu", "glm", { toolCall: undefined }),
      candidate("deepseek", "v4", { toolCall: undefined }),
    ]
    const suggestion = suggestAgentTeam({
      candidates,
      favorites: [ref("claude-code", "fable")],
      recents: [],
      lead: ref("zhipu", "glm"),
    })

    expect(ids(suggestion.coder)).toEqual(["claude-code/fable"])
    expect(suggestion.qa).toEqual([])
    expect(suggestion.qaSkipped).toBe("coderCannotRunQa")
  })

  test("a team that runs as suggested carries no skipped-panel reason", () => {
    const suggestion = suggestAgentTeam({ candidates: CLI_HEAVY, favorites: [], recents: [], lead: CLI_LEAD })

    expect(suggestion.qa.length).toBeGreaterThan(0)
    expect(suggestion.qaSkipped).toBeUndefined()
  })

  test("the top coder is never evicted, and its own model behind another provider is not swapped in", () => {
    // Both favorites are CLI. The only model that can orchestrate is the top coder's model under
    // another provider: seating it would compare a model with itself, and replacing the top coder
    // would override the user's first choice, so the top coder runs alone.
    const candidates = [candidate("claude-code", "opus"), candidate("codex-cli", "gpt"), candidate("anthropic", "opus")]
    const lead = ref("claude-code", "opus")
    const suggestion = suggestAgentTeam({
      candidates,
      favorites: [ref("claude-code", "opus"), ref("codex-cli", "gpt")],
      recents: [],
      lead,
    })

    expect(ids(suggestion.coder)).toEqual(["claude-code/opus"])
    expect(suggestion.qa).toEqual([])
  })

  test("with no coder, a lead that cannot orchestrate gets no panel whose reviewer would write the code", () => {
    // Nothing is known to call tools, so there is no coder and the turn would pass to a reviewer:
    // the lead's own model under another provider, reviewing what it wrote.
    const candidates = [
      candidate("claude-code", "opus", { toolCall: undefined }),
      candidate("custom", "opus", { toolCall: undefined }),
      candidate("zhipu", "glm", { toolCall: false }),
      candidate("deepseek", "v4", { toolCall: false }),
    ]
    const lead = ref("claude-code", "opus")

    expect(suggestAgentTeam({ candidates, favorites: [], recents: [], lead })).toEqual({ coder: [], qa: [] })
  })

  test("with no coder, a lead that can orchestrate still gets its QA panel", () => {
    const candidates = [
      candidate("kimi", "k3", { toolCall: undefined }),
      candidate("zhipu", "glm", { toolCall: false }),
      candidate("deepseek", "v4", { toolCall: false }),
    ]
    const suggestion = suggestAgentTeam({ candidates, favorites: [], recents: [], lead: ref("kimi", "k3") })

    expect(suggestion.coder).toEqual([])
    expect(ids(suggestion.qa)).toEqual(["deepseek/v4", "zhipu/glm"])
  })

  test("a suggested team is never one the send would skip or run on a model without tools", () => {
    const mixed = [
      candidate("claude-code", "fable"),
      candidate("codex-cli", "codex"),
      candidate("kimi", "k3"),
      candidate("grok", "g47", { toolCall: undefined }),
      candidate("zhipu", "glm", { toolCall: false }),
      candidate("deepseek", "v4", { toolCall: false }),
    ]
    const toolLess = [
      candidate("alibaba", "tiny", { toolCall: false }),
      candidate("claude-code", "fable"),
      candidate("codex-cli", "codex"),
      candidate("zhipu", "glm", { toolCall: false }),
      candidate("deepseek", "v4", { toolCall: false }),
    ]
    const leads = [CLI_LEAD, ref("alibaba", "tiny"), ref("kimi", "k3")]
    let suggestions = 0
    for (const candidates of [CLI_HEAVY, mixed, toolLess]) {
      for (const lead of leads) {
        const suggestion = suggestAgentTeam({ candidates, favorites: [], recents: [], lead })
        if (suggestion.coder.length === 0 && suggestion.qa.length === 0) continue
        suggestions++
        expect(blockedReason(candidates, lead)).toBeNull()
      }
    }
    expect(suggestions).toBeGreaterThan(0)
  })
})

describe("applyAgentTeamSuggestion", () => {
  test("a panel the suggestion left out is unticked, with its models remembered", () => {
    // The preview said the coder cannot run QA; keeping the hand-picked panel ticked contradicted it.
    const picked = { enabled: true, models: [ref("zhipu", "glm"), ref("deepseek", "v4")] }
    const team = applyAgentTeamSuggestion(
      { coder: { enabled: false, models: [] }, qa: picked },
      { coder: [{ ...ref("claude-code", "fable"), reason: "favorite" }], qa: [], qaSkipped: "coderCannotRunQa" },
    )

    expect(team.coder).toEqual({ enabled: true, models: [ref("claude-code", "fable")] })
    expect(team.qa).toEqual({ enabled: false, models: picked.models })
  })

  test("a catalog that simply cannot fill QA leaves a hand-picked panel alone", () => {
    const picked = { enabled: true, models: [ref("zhipu", "glm"), ref("deepseek", "v4")] }
    const team = applyAgentTeamSuggestion(
      { coder: { enabled: false, models: [] }, qa: picked },
      { coder: [{ ...ref("kimi", "k3"), reason: "favorite" }], qa: [] },
    )

    expect(team.qa).toEqual(picked)
  })

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


describe("a suggestion that leaves the QA panel out stays applicable", () => {
  // The composer's Apply button is enabled by `coder.length > 0 || qa.length > 0`, so a suggestion
  // whose only effect is unticking QA would be shown as "left out" and could never be applied —
  // the panel the user ticked would survive, and the send would then drop it without saying so.
  const SEATS = [
    candidate("kimi", "k3"),
    candidate("grok", "g47"),
    candidate("deepseek", "v4"),
    candidate("zhipu", "glm"),
  ]
  const NO_TOOLS = SEATS.map((entry) => ({ ...entry, toolCall: false }))
  const WITH_CLI = [candidate("claude-code", "fable"), ...SEATS]
  // No seat can orchestrate: the top coder keeps its place and the panel gives way.
  const ALL_CLI = [
    candidate("claude-code", "fable"),
    candidate("codex-cli", "codex"),
    candidate("dsh-cli", "dsh"),
    candidate("kimi-cli", "k3"),
  ]
  const CATALOGS = [SEATS, NO_TOOLS, WITH_CLI, ALL_CLI, [candidate("kimi", "k3")], []]
  const LEADS = [null, ref("kimi", "k3"), ref("claude-code", "fable"), ref("zhipu", "glm")]

  test("every catalog and lead still offers something to apply when the panel is skipped", () => {
    let skipped = 0
    for (const candidates of CATALOGS) {
      for (const lead of LEADS) {
        const suggestion = suggestAgentTeam({ candidates, favorites: [], recents: [], lead })
        if (!suggestion.qaSkipped) continue
        skipped += 1
        expect(suggestion.coder.length).toBeGreaterThan(0)
        expect(suggestion.qa).toHaveLength(0)
      }
    }
    // The matrix must actually reach the shape it guards, or it proves nothing.
    expect(skipped).toBeGreaterThan(0)
  })
})
