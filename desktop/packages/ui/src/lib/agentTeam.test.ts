import { describe, expect, test } from "vitest"
import {
  agentTeamExtraModelCount,
  agentTeamSelfReviewModels,
  disableAgentTeam,
  emptyAgentTeam,
  parseAgentTeam,
  resolveAgentTeamSend,
  setAgentTeamRoleEnabled,
  toggleAgentTeamModel,
  type AgentTeamModelRef,
  type AgentTeamState,
} from "./agentTeam"

const LEAD: AgentTeamModelRef = { providerID: "alibaba", modelID: "qwen" }
const A: AgentTeamModelRef = { providerID: "moonshot", modelID: "kimi" }
const B: AgentTeamModelRef = { providerID: "zhipu", modelID: "glm" }
const C: AgentTeamModelRef = { providerID: "deepseek", modelID: "v4" }
const D: AgentTeamModelRef = { providerID: "minimax", modelID: "m3" }
const E: AgentTeamModelRef = { providerID: "mistral", modelID: "large" }

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

  test("disableAgentTeam turns both roles off and keeps the models", () => {
    expect(disableAgentTeam(team([A], [B]))).toEqual({
      coder: { enabled: false, models: [A] },
      qa: { enabled: false, models: [B] },
    })
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
    const off = disableAgentTeam(team([A, B], [C]))
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

  test("one coder plus QA: the coder runs the turn and is told to request the review", () => {
    const send = resolveAgentTeamSend(team([A], [C]), LEAD)
    expect(send.providerID).toBe(A.providerID)
    expect(send.modelID).toBe(A.modelID)
    expect(send.directive).toContain("**council**")
    expect(send.directive).not.toContain("**arena**")
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
    const directive = resolveAgentTeamSend(team([], [C]), LEAD).directive ?? ""
    expect(directive).toContain("Pass exactly the listed providers")
    expect(directive).toContain("never fabricate")
    expect(directive).toContain("Do not change configuration yourself")
  })
})

describe("self-review and cost cue", () => {
  test("flags a QA model that is also a coder", () => {
    expect(agentTeamSelfReviewModels(team([A, B], [B, C]), LEAD)).toEqual([B])
  })

  test("with no coder, the composer model is the author", () => {
    expect(agentTeamSelfReviewModels(team([], [LEAD, C]), LEAD)).toEqual([LEAD])
    expect(agentTeamSelfReviewModels(team([A], [LEAD]), LEAD)).toEqual([])
  })

  test("counts the calls a send adds beyond the model running the turn", () => {
    expect(agentTeamExtraModelCount(emptyAgentTeam())).toBe(0)
    expect(agentTeamExtraModelCount(team([A], []))).toBe(0)
    expect(agentTeamExtraModelCount(team([A, B], []))).toBe(2)
    expect(agentTeamExtraModelCount(team([A], [C, D]))).toBe(2)
    expect(agentTeamExtraModelCount(team([A, B], [C, D, E, LEAD]))).toBe(6)
  })
})
