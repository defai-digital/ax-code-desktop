import { describe, expect, test } from "vitest"
import {
  agentTeamBlockedReason,
  agentTeamExtraModelCount,
  agentTeamRunner,
  agentTeamSendVariant,
  usableAgentTeam,
  agentTeamSelfReviewModels,
  emptyAgentTeam,
  isAgentTeamRoleIncomplete,
  parseAgentTeam,
  resolveAgentTeamSend,
  setAgentTeamRoleEnabled,
  toggleAgentTeamModel,
  type AgentTeamModelRef,
  type AgentTeamState,
} from "./agentTeam"
import { isExternalCliProvider } from "./providerModelAvailability"

const LEAD: AgentTeamModelRef = { providerID: "alibaba", modelID: "qwen" }
const A: AgentTeamModelRef = { providerID: "moonshot", modelID: "kimi" }
const B: AgentTeamModelRef = { providerID: "zhipu", modelID: "glm" }
const C: AgentTeamModelRef = { providerID: "deepseek", modelID: "v4" }
const D: AgentTeamModelRef = { providerID: "minimax", modelID: "m3" }
const E: AgentTeamModelRef = { providerID: "mistral", modelID: "large" }

// CLI providers run their own agent loop, so the runtime never gives them arena/council.
const CLI_LEAD: AgentTeamModelRef = { providerID: "claude-code", modelID: "claude-fable-5-2" }
const CLI_CODER: AgentTeamModelRef = { providerID: "codex-cli", modelID: "codex-large" }
const CLI_CODER_B: AgentTeamModelRef = { providerID: "dsh-cli", modelID: "dsh-pro" }
const CLI_QA: AgentTeamModelRef = { providerID: "grok-build-cli", modelID: "grok-code" }
const CLI_QA_B: AgentTeamModelRef = { providerID: "kimi-cli", modelID: "kimi-k3" }

/** Both roles unticked, with their models remembered. */
function unticked(state: AgentTeamState): AgentTeamState {
  return setAgentTeamRoleEnabled(setAgentTeamRoleEnabled(state, "coder", false), "qa", false)
}

function team(coders: AgentTeamModelRef[], qa: AgentTeamModelRef[]): AgentTeamState {
  return {
    coder: { enabled: coders.length > 0, models: coders },
    qa: { enabled: qa.length > 0, models: qa },
  }
}

describe("toggleAgentTeamModel", () => {
  test("adding a model turns the role on", () => {
    const next = toggleAgentTeamModel(emptyAgentTeam(), "coder", A)
    expect(next.coder).toEqual({ enabled: true, models: [A] })
    expect(next.qa.enabled).toBe(false)
  })

  test("refuses a third coder and a fifth QA model", () => {
    const coders = team([A, B], [])
    expect(toggleAgentTeamModel(coders, "coder", C)).toBe(coders)

    const qa = team([], [A, B, C, D])
    expect(toggleAgentTeamModel(qa, "qa", E)).toBe(qa)
  })

  test("removing the last model turns the role off", () => {
    const next = toggleAgentTeamModel(team([A], []), "coder", A)
    expect(next.coder).toEqual({ enabled: false, models: [] })
  })

  test("blank ids are rejected instead of becoming the model that runs the turn", () => {
    const empty = emptyAgentTeam()
    expect(toggleAgentTeamModel(empty, "coder", { providerID: "moonshot", modelID: " " })).toBe(empty)
    expect(toggleAgentTeamModel(empty, "coder", { providerID: "", modelID: "kimi" })).toBe(empty)
    expect(parseAgentTeam({ coder: { enabled: true, models: [{ providerID: " ", modelID: "kimi" }] } }).coder).toEqual({
      enabled: false,
      models: [],
    })
  })

  test("the same model may hold both roles", () => {
    const next = toggleAgentTeamModel(team([A], []), "qa", A)
    expect(next.qa.models).toEqual([A])
    expect(next.coder.models).toEqual([A])
  })
})

describe("setAgentTeamRoleEnabled", () => {
  test("unticking keeps the models so ticking again restores them", () => {
    const off = setAgentTeamRoleEnabled(team([A, B], []), "coder", false)
    expect(off.coder).toEqual({ enabled: false, models: [A, B] })
    expect(setAgentTeamRoleEnabled(off, "coder", true).coder.enabled).toBe(true)
  })

  test("a role with no models cannot be turned on", () => {
    expect(setAgentTeamRoleEnabled(emptyAgentTeam(), "qa", true).qa.enabled).toBe(false)
  })
})

describe("parseAgentTeam", () => {
  test("drops malformed and duplicate refs and enforces the limits", () => {
    const parsed = parseAgentTeam({
      coder: { enabled: true, models: [A, A, { providerID: "x" }, null, B, C] },
      qa: { enabled: true, models: [A, B, C, D, E] },
    })
    expect(parsed.coder.models).toEqual([A, B])
    expect(parsed.qa.models).toEqual([A, B, C, D])
  })

  test("garbage becomes an empty team, and an enabled role without models is off", () => {
    expect(parseAgentTeam("nope")).toEqual(emptyAgentTeam())
    expect(parseAgentTeam({ coder: { enabled: true, models: [] } }).coder.enabled).toBe(false)
  })
})

describe("resolveAgentTeamSend", () => {
  test("no active role leaves the send untouched", () => {
    expect(resolveAgentTeamSend(emptyAgentTeam(), LEAD)).toEqual({ ...LEAD, directive: null })
  })

  test("remembered models of an unticked role are ignored", () => {
    const off = unticked(team([A, B], [C]))
    expect(resolveAgentTeamSend(off, LEAD)).toEqual({ ...LEAD, directive: null })
  })

  test("one coder runs the turn itself with no instructions", () => {
    expect(resolveAgentTeamSend(team([A], []), LEAD)).toEqual({ ...A, directive: null })
  })

  test("two coders keep the composer model as lead and call arena with exactly those providers", () => {
    const send = resolveAgentTeamSend(team([A, B], []), LEAD)
    expect(send.providerID).toBe(LEAD.providerID)
    expect(send.modelID).toBe(LEAD.modelID)
    expect(send.directive).toContain("**arena**")
    expect(send.directive).toContain('mode: "implement"')
    // A plain question must not be pushed into the write path.
    expect(send.directive).toContain('mode: "plan"')
    expect(send.directive).toContain("Do not stash, reset, or clean it")
    expect(send.directive).toContain(JSON.stringify([A, B]))
    expect(send.directive).not.toContain("**council**")
  })

  test("QA only: the composer model does the work, then council reviews with the picked models", () => {
    const send = resolveAgentTeamSend(team([], [C, D]), LEAD)
    expect(send.providerID).toBe(LEAD.providerID)
    expect(send.directive).toContain("**council**")
    expect(send.directive).toContain('kind: "review"')
    expect(send.directive).toContain(JSON.stringify([C, D]))
    expect(send.directive).not.toContain("**arena**")
    // The council tool takes `question`, and a request without file changes is still reviewed.
    expect(send.directive).toContain("Set `question`")
    expect(send.directive).toContain("within 24000 characters")
    expect(send.directive).toContain("changed no files")
  })

  test("a single QA model is not sent: the runtime's council refuses one reviewer", () => {
    const one = team([], [C])
    expect(isAgentTeamRoleIncomplete(one, "qa")).toBe(true)
    expect(resolveAgentTeamSend(one, LEAD)).toEqual({ ...LEAD, directive: null })
    expect(agentTeamExtraModelCount(one)).toBe(0)

    // The coder half of the team still runs.
    expect(resolveAgentTeamSend(team([A], [C]), LEAD)).toEqual({ ...A, directive: null })
    expect(isAgentTeamRoleIncomplete(team([], [C, D]), "qa")).toBe(false)
    expect(isAgentTeamRoleIncomplete(unticked(one), "qa")).toBe(false)
  })

  test("a panel above council's default member limit tells the lead to report dropped reviewers", () => {
    const four = resolveAgentTeamSend(team([], [A, C, D, E]), LEAD).directive ?? ""
    expect(four).toContain("modes.council.maxMembers")
    expect(four).toContain("left out")

    const three = resolveAgentTeamSend(team([], [C, D, E]), LEAD).directive ?? ""
    expect(three).not.toContain("modes.council.maxMembers")
  })

  test("one coder plus QA: the coder runs the turn and is told to request the review", () => {
    const send = resolveAgentTeamSend(team([A], [C, D]), LEAD)
    expect(send.providerID).toBe(A.providerID)
    expect(send.modelID).toBe(A.modelID)
    expect(send.directive).toContain("**council**")
    expect(send.directive).not.toContain("**arena**")
  })

  test("a CLI lead cannot orchestrate: the first non-CLI coder runs the arena directive", () => {
    const send = resolveAgentTeamSend(team([CLI_CODER, A], []), CLI_LEAD)
    expect(send.providerID).toBe(A.providerID)
    expect(send.modelID).toBe(A.modelID)
    expect(send.directive).toContain("**arena**")
    // The CLI coder is still an arena member; only the orchestrating runner changed.
    expect(send.directive).toContain(JSON.stringify([CLI_CODER, A]))
  })

  test("a CLI lead with QA only: the first non-CLI reviewer runs the council directive", () => {
    const send = resolveAgentTeamSend(team([], [CLI_QA, C, D]), CLI_LEAD)
    expect(send.providerID).toBe(C.providerID)
    expect(send.modelID).toBe(C.modelID)
    expect(send.directive).toContain("**council**")
    expect(send.directive).toContain(JSON.stringify([CLI_QA, C, D]))
  })

  test("a CLI lead with an all-CLI team sends no directive: nothing could run arena or council", () => {
    expect(resolveAgentTeamSend(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B]), CLI_LEAD)).toEqual({
      ...CLI_LEAD,
      directive: null,
    })
  })

  test("a single CLI coder with QA skips QA: the coder runs the turn with no directive", () => {
    // Neither the coder nor the lead matters here: the council directive would go to the CLI coder.
    expect(resolveAgentTeamSend(team([CLI_CODER], [C, D]), LEAD)).toEqual({ ...CLI_CODER, directive: null })
    expect(resolveAgentTeamSend(team([CLI_CODER], [C, D]), CLI_LEAD)).toEqual({ ...CLI_CODER, directive: null })
  })

  test("never returns a directive together with a CLI-provider runner", () => {
    const leads = [LEAD, CLI_LEAD]
    const coderSets = [[], [A], [CLI_CODER], [A, B], [CLI_CODER, A], [CLI_CODER, CLI_CODER_B]]
    const qaSets = [[], [C], [C, D], [CLI_QA, C], [CLI_QA, CLI_QA_B]]
    let directives = 0
    let skipped = 0
    for (const lead of leads) {
      for (const coders of coderSets) {
        for (const qa of qaSets) {
          const state = team(coders, qa)
          const blocked = agentTeamBlockedReason(state, lead)
          const send = resolveAgentTeamSend(state, lead)
          if (blocked) {
            skipped++
            expect(send.directive).toBeNull()
          }
          if (send.directive === null) continue
          directives++
          expect(isExternalCliProvider(send.providerID)).toBe(false)
        }
      }
    }
    // Both paths are exercised, so the invariant above is not vacuous.
    expect(directives).toBeGreaterThan(0)
    expect(skipped).toBeGreaterThan(0)
  })

  test("a non-CLI lead still orchestrates its own team", () => {
    const send = resolveAgentTeamSend(team([A, B], [C, D]), LEAD)
    expect(send.providerID).toBe(LEAD.providerID)
    expect(send.modelID).toBe(LEAD.modelID)
  })

  test("a single CLI coder still runs the turn itself: no runtime tool is needed", () => {
    expect(resolveAgentTeamSend(team([CLI_CODER], []), CLI_LEAD)).toEqual({ ...CLI_CODER, directive: null })
  })

  test("two coders plus QA: arena first, then council on its result", () => {
    const directive = resolveAgentTeamSend(team([A, B], [C, D, E]), LEAD).directive ?? ""
    expect(directive.indexOf("**arena**")).toBeGreaterThan(-1)
    expect(directive.indexOf("**council**")).toBeGreaterThan(directive.indexOf("**arena**"))
    expect(directive).toContain(JSON.stringify([C, D, E]))
    // Arena never merges, so reviewers must be given the candidate rather than the main worktree.
    expect(directive).toContain("do not substitute the main worktree's diff")
  })

  test("every directive forbids substituting members and fabricating output", () => {
    const directive = resolveAgentTeamSend(team([], [C, D]), LEAD).directive ?? ""
    expect(directive).toContain("Pass exactly the listed providers")
    expect(directive).toContain("never fabricate")
    expect(directive).toContain("Do not change configuration yourself")
  })
})

describe("agentTeamRunner", () => {
  test("a single coder runs the turn itself, CLI or not", () => {
    expect(agentTeamRunner(team([A], [C, D]), LEAD)).toEqual(A)
    expect(agentTeamRunner(team([CLI_CODER], []), LEAD)).toEqual(CLI_CODER)
  })

  test("a CLI lead hands orchestration to the first non-CLI coder", () => {
    expect(agentTeamRunner(team([CLI_CODER, A], []), CLI_LEAD)).toEqual(A)
    expect(agentTeamRunner(team([A, CLI_CODER], []), CLI_LEAD)).toEqual(A)
  })

  test("with no coders, a CLI lead hands orchestration to the first non-CLI reviewer", () => {
    expect(agentTeamRunner(team([], [CLI_QA, C, D]), CLI_LEAD)).toEqual(C)
    // C is passed over here because a CLI reviewer must not orchestrate either.
    expect(agentTeamRunner(team([], [CLI_QA, CLI_QA_B, D]), CLI_LEAD)).toEqual(D)
  })

  test("a team with no non-CLI model keeps the lead", () => {
    expect(agentTeamRunner(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B]), CLI_LEAD)).toEqual(CLI_LEAD)
  })

  test("a non-CLI lead orchestrates itself", () => {
    expect(agentTeamRunner(team([A, B], []), LEAD)).toEqual(LEAD)
    expect(agentTeamRunner(team([], [C, D]), LEAD)).toEqual(LEAD)
  })

  test("the lead runs whenever no directive is needed", () => {
    expect(agentTeamRunner(emptyAgentTeam(), CLI_LEAD)).toEqual(CLI_LEAD)
    // One QA model is below the council minimum, so there is nothing to orchestrate.
    expect(agentTeamRunner(team([], [C]), CLI_LEAD)).toEqual(CLI_LEAD)
    // Remembered models of an unticked role do not count either.
    expect(agentTeamRunner(unticked(team([], [C, D])), CLI_LEAD)).toEqual(CLI_LEAD)
  })
})

describe("agentTeamBlockedReason", () => {
  test("a single CLI coder with QA skips the QA step, whoever leads", () => {
    expect(agentTeamBlockedReason(team([CLI_CODER], [C, D]), LEAD)).toBe("cliCoderQa")
    expect(agentTeamBlockedReason(team([CLI_CODER], [C, D]), CLI_LEAD)).toBe("cliCoderQa")
  })

  test("a single non-CLI coder orchestrates its own QA panel", () => {
    expect(agentTeamBlockedReason(team([A], [C, D]), LEAD)).toBeNull()
    expect(agentTeamBlockedReason(team([A], [C, D]), CLI_LEAD)).toBeNull()
  })

  test("a CLI lead with no non-CLI team model cannot orchestrate anything", () => {
    expect(agentTeamBlockedReason(team([CLI_CODER, CLI_CODER_B], []), CLI_LEAD)).toBe("noOrchestrator")
    expect(agentTeamBlockedReason(team([], [CLI_QA, CLI_QA_B]), CLI_LEAD)).toBe("noOrchestrator")
    expect(agentTeamBlockedReason(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B]), CLI_LEAD)).toBe("noOrchestrator")
  })

  test("one non-CLI team model is enough to orchestrate", () => {
    expect(agentTeamBlockedReason(team([CLI_CODER, A], []), CLI_LEAD)).toBeNull()
    expect(agentTeamBlockedReason(team([CLI_CODER, CLI_CODER_B], [CLI_QA, C]), CLI_LEAD)).toBeNull()
  })

  test("a non-CLI lead is never blocked: it can call the tools itself", () => {
    expect(agentTeamBlockedReason(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B]), LEAD)).toBeNull()
  })

  test("a team with nothing to orchestrate is never blocked", () => {
    expect(agentTeamBlockedReason(emptyAgentTeam(), CLI_LEAD)).toBeNull()
    expect(agentTeamBlockedReason(team([CLI_CODER], []), CLI_LEAD)).toBeNull()
    expect(agentTeamBlockedReason(unticked(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B])), CLI_LEAD)).toBeNull()
  })
})

describe("self-review and cost cue", () => {
  test("flags a QA model that is also a coder", () => {
    expect(agentTeamSelfReviewModels(team([A, B], [B, C]), LEAD)).toEqual([B])
    // The author set is the coders, whoever orchestrates them.
    expect(agentTeamSelfReviewModels(team([A, B], [B, C]), CLI_LEAD)).toEqual([B])
  })

  test("with no coder, the composer model is the author", () => {
    expect(agentTeamSelfReviewModels(team([], [LEAD, C]), LEAD)).toEqual([LEAD])
    expect(agentTeamSelfReviewModels(team([A], [LEAD]), LEAD)).toEqual([])
  })

  test("with no coder and a CLI lead, the substituted runner is the author", () => {
    // C runs the turn, so the hint must flag C reviewing its own work, not the CLI lead.
    expect(agentTeamSelfReviewModels(team([], [CLI_QA, C, D]), CLI_LEAD)).toEqual([C])
    expect(agentTeamSelfReviewModels(team([], [CLI_QA, CLI_QA_B]), CLI_LEAD)).toEqual([])
  })

  test("a step the send skips is not flagged: it never reviews anything", () => {
    // The CLI coder would be both author and reviewer, but the QA step is dropped.
    expect(agentTeamSelfReviewModels(team([CLI_CODER], [CLI_CODER, C]), LEAD)).toEqual([])
    // The CLI lead would review its own work, but the whole team is dropped.
    expect(agentTeamSelfReviewModels(team([], [CLI_QA, CLI_QA_B]), CLI_QA)).toEqual([])
  })

  test("counts the calls a send adds beyond the model running the turn", () => {
    expect(agentTeamExtraModelCount(emptyAgentTeam())).toBe(0)
    expect(agentTeamExtraModelCount(team([A], []))).toBe(0)
    expect(agentTeamExtraModelCount(team([A, B], []))).toBe(2)
    expect(agentTeamExtraModelCount(team([A], [C, D]))).toBe(2)
    expect(agentTeamExtraModelCount(team([A, B], [C, D, E, LEAD]))).toBe(6)
  })

  test("a step the send skips costs no extra call", () => {
    expect(agentTeamExtraModelCount(team([CLI_CODER], [C, D]), LEAD)).toBe(0)
    expect(agentTeamExtraModelCount(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B]), CLI_LEAD)).toBe(0)
    // A substituted non-CLI runner still fans out.
    expect(agentTeamExtraModelCount(team([CLI_CODER, A], []), CLI_LEAD)).toBe(2)
    // Without a lead the caller is asking about the team itself, so every step counts.
    expect(agentTeamExtraModelCount(team([CLI_CODER, CLI_CODER_B], [CLI_QA, CLI_QA_B]))).toBe(4)
  })
})

describe("usableAgentTeam", () => {
  const catalog = [
    { id: "moonshot", models: [{ id: "kimi" }] },
    { id: "zhipu", models: [{ id: "glm" }] },
    // Cannot return text, so the composer refuses it too.
    { id: "deepseek", models: [{ id: "v4", capabilities: { output: { text: false } } }] },
  ]

  test("drops models whose provider is gone, that left the catalog, or that cannot run", () => {
    const usable = usableAgentTeam(team([A, D], [B, C, E]), catalog)
    expect(usable.coder).toEqual({ enabled: true, models: [A] })
    expect(usable.qa).toEqual({ enabled: true, models: [B] })
  })

  test("a role left below its minimum no longer runs", () => {
    const usable = usableAgentTeam(team([], [B, C]), catalog)
    expect(resolveAgentTeamSend(usable, LEAD)).toEqual({ ...LEAD, directive: null })
  })

  test("a team that is entirely usable is returned as is", () => {
    const state = team([A], [A, B])
    expect(usableAgentTeam(state, catalog)).toBe(state)
  })
})

describe("agentTeamSendVariant", () => {
  const catalog = [
    { id: "moonshot", models: [{ id: "kimi", variants: { high: {}, max: {} } }] },
    { id: "zhipu", models: [{ id: "glm" }] },
  ]

  test("the composer model keeps its own variant", () => {
    expect(agentTeamSendVariant(catalog, LEAD, LEAD, "high")).toBe("high")
  })

  test("a coder gets the variant only when it offers the same one", () => {
    expect(agentTeamSendVariant(catalog, A, LEAD, "high")).toBe("high")
    expect(agentTeamSendVariant(catalog, A, LEAD, "low")).toBeUndefined()
    expect(agentTeamSendVariant(catalog, B, LEAD, "high")).toBeUndefined()
  })

  test("no variant stays no variant", () => {
    expect(agentTeamSendVariant(catalog, A, LEAD, undefined)).toBeUndefined()
  })
})
