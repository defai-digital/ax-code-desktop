import { describe, expect, test } from "vitest"
import {
  agentTeamBlockedReason,
  emptyAgentTeam,
  type AgentTeamCatalogProvider,
  type AgentTeamModelRef,
} from "./agentTeam"
import {
  agentTeamModelTraits,
  applyAgentTeamSuggestion,
  suggestAgentTeam,
  type AgentTeamCandidate,
} from "./agentTeamSuggest"

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
      candidates: [candidate("kimi", "k3"), candidate("grok", "g47")],
      favorites: [],
      recents: [],
    })

    expect(suggestion.coder).toHaveLength(2)
    expect(suggestion.qa).toEqual([])
  })

  test("a second coder gives way when it would leave the team without a review panel", () => {
    const suggestion = suggestAgentTeam({
      candidates: [candidate("kimi", "k3"), candidate("grok", "g47"), candidate("zhipu", "glm")],
      favorites: [ref("kimi", "k3")],
      recents: [],
    })

    // Three models cannot fill an arena and a council: one coder with two reviewers is the team.
    expect(ids(suggestion.coder)).toEqual(["kimi/k3"])
    expect(ids(suggestion.qa)).toEqual(["grok/g47", "zhipu/glm"])
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

describe("role-aware suggestions", () => {
  const reasons = (models: readonly { reason: string }[]) => models.map((model) => model.reason)
  // A gateway and a local engine as users have them: a router alias, fast tiers, a coding model in
  // two quantizations, and general reasoning models.
  const MIXED = [
    candidate("gateway", "coding-dev-auto"),
    candidate("gateway", "glm-5.3-flash", { reasoning: true }),
    candidate("gateway", "MiniMax-M3.1-Flash", { reasoning: true }),
    candidate("gateway", "glm-5.3", { reasoning: true }),
    candidate("gateway", "k3.1-pro", { reasoning: true }),
    candidate("other", "nvidia/nemotron-3-ultra-550b-a55b", { reasoning: true }),
    candidate("ax-engine", "tiel-coder-35b-axq-mxfp4"),
    candidate("ax-engine", "tiel-coder-35b-axq-mxfp8"),
  ]

  test("with no history a coding model codes and reasoning models review", () => {
    const suggestion = suggestAgentTeam({ candidates: MIXED, favorites: [], recents: [] })

    expect(ids(suggestion.coder)).toEqual(["ax-engine/tiel-coder-35b-axq-mxfp8", "gateway/glm-5.3"])
    expect(reasons(suggestion.coder)).toEqual(["codingModel", "otherProvider"])
    expect(ids(suggestion.qa)).toEqual(["other/nvidia/nemotron-3-ultra-550b-a55b", "gateway/k3.1-pro"])
    expect(reasons(suggestion.qa)).toEqual(["reasoningModel", "reasoningModel"])
  })

  test("a router alias and fast tiers are seated only when nothing else is left", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("gateway", "coding-dev-auto", { releaseDate: "2026-09-01" }),
        candidate("gateway", "glm-5.3-flash", { reasoning: true, releaseDate: "2026-09-01" }),
        candidate("gateway", "glm-5.3", { releaseDate: "2025-01-01" }),
        candidate("gateway", "k3.1-pro", { releaseDate: "2025-01-01" }),
        candidate("gateway", "deepseek-v4", { releaseDate: "2025-01-01" }),
      ],
      favorites: [],
      recents: [],
    })

    // Newer, reasoning-flagged and alphabetically first: the old order led with the alias and the
    // flash tier. Three models suit the roles, so one codes and two review rather than two coding
    // with the flash tier and the alias as their panel.
    expect(ids(suggestion.coder)).toEqual(["gateway/deepseek-v4"])
    expect(ids(suggestion.qa)).toEqual(["gateway/glm-5.3", "gateway/k3.1-pro"])
  })

  test("a fast tier fills a seat the panel needs to run, and no optional one", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("a", "alpha"),
        candidate("b", "beta"),
        candidate("c", "gamma-flash"),
        candidate("d", "delta-mini"),
      ],
      favorites: [],
      recents: [],
    })

    // Two suited models cannot fill a panel after a coder is seated, so the arena stays and the
    // panel reaches its minimum of two with the fast tiers; nothing asks for a third.
    expect(ids(suggestion.coder)).toEqual(["a/alpha", "b/beta"])
    expect(ids(suggestion.qa)).toEqual(["c/gamma-flash", "d/delta-mini"])
    expect(reasons(suggestion.qa)).toEqual(["otherProvider", "otherProvider"])
  })

  test("a favorite fast-tier model does not take a seat from a model that suits the role", () => {
    const suggestion = suggestAgentTeam({
      candidates: MIXED,
      favorites: [ref("gateway", "MiniMax-M3.1-Flash"), ref("gateway", "k3.1-pro")],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["ax-engine/tiel-coder-35b-axq-mxfp8", "gateway/k3.1-pro"])
    expect(ids([...suggestion.coder, ...suggestion.qa])).not.toContain("gateway/MiniMax-M3.1-Flash")
  })

  test("role fit comes before a composer-wide favorite, which then orders the models that fit", () => {
    const suggestion = suggestAgentTeam({
      candidates: MIXED,
      favorites: [ref("gateway", "glm-5.3"), ref("gateway", "k3.1-pro")],
      recents: [],
    })

    // The coding model codes; the favorites are general models and take the next coder seat in the
    // user's order. Favorites are not role statements, so neither displaces the coding model.
    expect(ids(suggestion.coder)).toEqual(["ax-engine/tiel-coder-35b-axq-mxfp8", "gateway/glm-5.3"])
    expect(reasons(suggestion.coder)).toEqual(["codingModel", "favorite"])
    // Among reasoning reviewers the remaining favorite is seated with the one from another provider.
    expect(ids(suggestion.qa)).toEqual(["other/nvidia/nemotron-3-ultra-550b-a55b", "gateway/k3.1-pro"])
    expect(reasons(suggestion.qa)).toEqual(["reasoningModel", "reasoningModel"])
  })

  test("a vendor coding CLI counts as a coder whatever its model is called", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("gateway", "glm-5.3", { reasoning: true }),
        candidate("gateway", "k3.1-pro", { reasoning: true }),
        candidate("other", "nemotron", { reasoning: true }),
        candidate("claude-code", "opus", { reasoning: true }),
      ],
      favorites: [],
      recents: [],
      lead: ref("gateway", "glm-5.3"),
    })

    expect(ids(suggestion.coder)[0]).toBe("claude-code/opus")
    expect(reasons(suggestion.coder)[0]).toBe("codingModel")
    expect(ids(suggestion.qa)).not.toContain("claude-code/opus")
  })

  test("the user's own picks for a role come first and stay in that role", () => {
    const team = {
      coder: { enabled: true, models: [ref("gateway", "glm-5.3-flash")] },
      // Unticked, but still the user's statement of what reviews well.
      qa: { enabled: false, models: [ref("gateway", "k3.1-pro"), ref("gateway", "glm-5.3")] },
    }
    const suggestion = suggestAgentTeam({
      candidates: MIXED,
      // Favorites would otherwise make the QA picks the coders.
      favorites: [ref("gateway", "k3.1-pro"), ref("gateway", "glm-5.3")],
      recents: [],
      team,
    })

    // A fast tier the user chose as coder is their call, not a name to second-guess.
    expect(ids(suggestion.coder)).toEqual(["gateway/glm-5.3-flash", "ax-engine/tiel-coder-35b-axq-mxfp8"])
    expect(reasons(suggestion.coder)).toEqual(["rolePick", "codingModel"])
    expect(ids(suggestion.qa).slice(0, 2)).toEqual(["gateway/k3.1-pro", "gateway/glm-5.3"])
    expect(reasons(suggestion.qa).slice(0, 2)).toEqual(["rolePick", "rolePick"])
  })

  test("a team the user filled by hand is suggested back unchanged", () => {
    const team = {
      coder: { enabled: true, models: [ref("gateway", "k3.1-pro"), ref("ax-engine", "tiel-coder-35b-axq-mxfp4")] },
      qa: {
        enabled: true,
        models: [ref("gateway", "glm-5.3"), ref("other", "nvidia/nemotron-3-ultra-550b-a55b")],
      },
    }
    const suggestion = suggestAgentTeam({ candidates: MIXED, favorites: [], recents: [], team })

    expect(ids(suggestion.coder)).toEqual(ids(team.coder.models))
    expect(ids(suggestion.qa).slice(0, 2)).toEqual(ids(team.qa.models))
    // The quantization the user chose stands for the model, not the wider one.
    expect(ids(suggestion.qa)).not.toContain("ax-engine/tiel-coder-35b-axq-mxfp8")
  })

  test("two quantizations of one model are never both coders, nor author and reviewer", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("ax-engine", "tiel-coder-35b-axq-mxfp4"),
        candidate("ax-engine", "tiel-coder-35b-axq-mxfp8"),
        candidate("gateway", "glm-5.3"),
        candidate("gateway", "k3.1-pro"),
      ],
      favorites: [ref("ax-engine", "tiel-coder-35b-axq-mxfp4"), ref("ax-engine", "tiel-coder-35b-axq-mxfp8")],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["ax-engine/tiel-coder-35b-axq-mxfp4"])
    expect(ids(suggestion.qa)).toEqual(["gateway/glm-5.3", "gateway/k3.1-pro"])
  })

  test("another provider is preferred only among models that suit the role", () => {
    const suggestion = suggestAgentTeam({
      candidates: [candidate("a", "c1"), candidate("a", "c2"), candidate("b", "nano")],
      favorites: [ref("a", "c1"), ref("a", "c2")],
      recents: [],
      lead: ref("a", "c1"),
    })

    // The old order seated `b/nano` second for being behind another provider.
    expect(ids(suggestion.coder)).toEqual(["a/c1", "a/c2"])
    expect(suggestion.qa).toEqual([])
  })

  test("a context window too small for the work ranks after one that is not stated", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("a", "alpha", { contextLimit: 8_000 }),
        candidate("a", "beta"),
        candidate("a", "gamma", { contextLimit: 200_000 }),
      ],
      favorites: [],
      recents: [],
    })

    expect(ids(suggestion.coder)).toEqual(["a/beta"])
    expect(ids(suggestion.qa)).toEqual(["a/gamma", "a/alpha"])
  })

  test("the display name carries the same hints as the id", () => {
    const suggestion = suggestAgentTeam({
      candidates: [
        candidate("a", "m-1", { name: "Alpha Flash" }),
        candidate("a", "m-2", { name: "Beta Coder" }),
        candidate("a", "m-3", { name: "Gamma" }),
        candidate("a", "m-4", { name: "Delta" }),
      ],
      favorites: [],
      recents: [],
    })

    expect(ids(suggestion.coder)[0]).toBe("a/m-2")
    expect(ids([...suggestion.coder, ...suggestion.qa])).not.toContain("a/m-1")
  })

  test("traits are read from whole tokens and ignore case, namespace and packaging", () => {
    expect(agentTeamModelTraits("tiel-coder-35b-axq-mxfp4")).toMatchObject({
      family: "tiel-coder-35b",
      coding: true,
      light: false,
      router: false,
      precision: 4,
    })
    expect(agentTeamModelTraits("tiel-coder-35b-axq-mxfp8").family).toBe("tiel-coder-35b")
    expect(agentTeamModelTraits("NVIDIA/Nemotron-3-Ultra").family).toBe("nemotron-3-ultra")
    expect(agentTeamModelTraits("llama-3:q4_k_m").family).toBe("llama-3")
    expect(agentTeamModelTraits("MiniMax-M3.1-Flash").light).toBe(true)
    expect(agentTeamModelTraits("m", "Claude Haiku 5.5").light).toBe(true)
    expect(agentTeamModelTraits("coding-dev-auto")).toMatchObject({ coding: true, router: true })
    // Substrings are not hints: `minimax` is not `mini`, `encoder` is not `coder`, `autumn` is not `auto`.
    expect(agentTeamModelTraits("minimax-encoder-autumn")).toMatchObject({ coding: false, light: false, router: false })
    expect(agentTeamModelTraits("glm-5.3").precision).toBe(Number.POSITIVE_INFINITY)
    // An id that is nothing but packaging keeps itself rather than collapsing to an empty family.
    expect(agentTeamModelTraits("gguf").family).toBe("gguf")
  })

  test("role-aware order is the same whatever the catalog order", () => {
    const expected = suggestAgentTeam({ candidates: MIXED, favorites: [], recents: [] })
    expect(suggestAgentTeam({ candidates: [...MIXED].reverse(), favorites: [], recents: [] })).toEqual(expected)
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
    // `codex` is named as a coding model, so the general models are seated as reviewers before it.
    expect(suggestion.qa.map((model) => model.providerID)).toEqual(["dsh-cli", "grok-build-cli", "kimi-cli"])
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
