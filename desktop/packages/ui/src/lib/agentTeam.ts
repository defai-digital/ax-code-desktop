/**
 * Agent team: optional Coder and QA model selections made in the composer.
 *
 * Desktop owns only the selection and the request wording. Execution stays in the AX Code runtime:
 * two coders run through its `arena` tool (implement mode, isolated worktrees) and QA models run
 * through its `council` tool (review). A single coder is an ordinary single-agent turn on that model.
 */

export type AgentTeamRole = "coder" | "qa"

export interface AgentTeamModelRef {
  providerID: string
  modelID: string
}

export interface AgentTeamRoleState {
  /** The checkbox. Turning a role off keeps its models so turning it back on restores them. */
  enabled: boolean
  models: AgentTeamModelRef[]
}

export type AgentTeamState = Record<AgentTeamRole, AgentTeamRoleState>

export interface AgentTeamSend {
  /** Model that runs the turn: the single coder when exactly one is active, otherwise the composer model. */
  providerID: string
  modelID: string
  /** Instructions for the runtime, sent as a synthetic part. Null when the team adds nothing to say. */
  directive: string | null
}

export const AGENT_TEAM_ROLES: readonly AgentTeamRole[] = ["coder", "qa"]

/** Coders compete on real patches, so two is the useful ceiling; review benefits from a wider panel. */
export const AGENT_TEAM_LIMITS: Record<AgentTeamRole, number> = { coder: 2, qa: 4 }

export function emptyAgentTeam(): AgentTeamState {
  return { coder: { enabled: false, models: [] }, qa: { enabled: false, models: [] } }
}

export function isSameAgentTeamModel(a: AgentTeamModelRef, b: AgentTeamModelRef): boolean {
  return a.providerID === b.providerID && a.modelID === b.modelID
}

/** A usable model ref, or null. Blank ids would otherwise become the model that runs the turn. */
function parseModelRef(value: unknown): AgentTeamModelRef | null {
  if (!value || typeof value !== "object") return null
  const { providerID, modelID } = value as Record<string, unknown>
  if (typeof providerID !== "string" || typeof modelID !== "string") return null
  if (!providerID.trim() || !modelID.trim()) return null
  return { providerID, modelID }
}

function parseModels(value: unknown, max: number): AgentTeamModelRef[] {
  if (!Array.isArray(value)) return []
  const models: AgentTeamModelRef[] = []
  for (const entry of value) {
    const ref = parseModelRef(entry)
    if (!ref) continue
    if (models.some((model) => isSameAgentTeamModel(model, ref))) continue
    models.push(ref)
    if (models.length === max) break
  }
  return models
}

function parseRole(value: unknown, max: number): AgentTeamRoleState {
  if (!value || typeof value !== "object") return { enabled: false, models: [] }
  const record = value as Record<string, unknown>
  const models = parseModels(record.models, max)
  // An enabled role with no models would promise a team that cannot run.
  return { enabled: record.enabled === true && models.length > 0, models }
}

/** Sanitize persisted or external state: valid refs only, no duplicates, limits enforced. */
export function parseAgentTeam(value: unknown): AgentTeamState {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    coder: parseRole(record.coder, AGENT_TEAM_LIMITS.coder),
    qa: parseRole(record.qa, AGENT_TEAM_LIMITS.qa),
  }
}

/**
 * Add or remove one model from a role. Adding enables the role; removing the last model disables it.
 * Adding beyond the limit is a no-op: the menu disables those options, so this is the backstop.
 */
export function toggleAgentTeamModel(team: AgentTeamState, role: AgentTeamRole, ref: AgentTeamModelRef): AgentTeamState {
  const current = team[role]
  if (current.models.some((model) => isSameAgentTeamModel(model, ref))) {
    const models = current.models.filter((model) => !isSameAgentTeamModel(model, ref))
    return { ...team, [role]: { enabled: current.enabled && models.length > 0, models } }
  }
  const valid = parseModelRef(ref)
  if (!valid || current.models.length >= AGENT_TEAM_LIMITS[role]) return team
  return { ...team, [role]: { enabled: true, models: [...current.models, valid] } }
}

/** Set the checkbox. A role cannot be on without a model. */
export function setAgentTeamRoleEnabled(team: AgentTeamState, role: AgentTeamRole, enabled: boolean): AgentTeamState {
  const current = team[role]
  return { ...team, [role]: { ...current, enabled: enabled && current.models.length > 0 } }
}

/** Turn both roles off and keep the remembered models. */
export function disableAgentTeam(team: AgentTeamState): AgentTeamState {
  return {
    coder: { ...team.coder, enabled: false },
    qa: { ...team.qa, enabled: false },
  }
}

export function activeAgentTeamModels(team: AgentTeamState, role: AgentTeamRole): AgentTeamModelRef[] {
  return team[role].enabled ? team[role].models : []
}

/**
 * QA models that review their own work. `lead` is the composer model, which writes the code when
 * no coder is selected.
 */
export function agentTeamSelfReviewModels(team: AgentTeamState, lead?: AgentTeamModelRef | null): AgentTeamModelRef[] {
  const coders = activeAgentTeamModels(team, "coder")
  const authors = coders.length > 0 ? coders : lead ? [lead] : []
  return activeAgentTeamModels(team, "qa").filter((model) =>
    authors.some((author) => isSameAgentTeamModel(author, model)),
  )
}

function providersArgument(models: readonly AgentTeamModelRef[]): string {
  return JSON.stringify(models.map(({ providerID, modelID }) => ({ providerID, modelID })))
}

const DIRECTIVE_HEADER = [
  "[AX Code Desktop agent team]",
  "The user chose an agent team for this request in the composer. Keep the user's own scope and constraints, and follow the steps below in order.",
]

const DIRECTIVE_FOOTER = [
  "Rules:",
  "- Pass exactly the listed providers. Do not add, drop, or substitute members.",
  "- Continue to the next step only after a tool call succeeds. If a tool is disabled, a provider is not connected, or a call fails, stop and tell the user what blocked it. Do not change configuration yourself (leave `enableIfDisabled` unset).",
  "- Attribute each result to the model that returned it. Report only what the tools returned: never fabricate multi-model output, and omit categories that came back empty.",
]

function coderStep(coders: readonly AgentTeamModelRef[]): string[] {
  return [
    `Coding (two coders): call the **arena** tool with the user's request as \`task\` and \`providers: ${providersArgument(coders)}\`.`,
    "- If the request asks for file changes, use `mode: \"implement\"`. First confirm the main worktree is clean; if it is not, stop and report that. Do not stash, reset, or clean it.",
    "- If the request is a question, analysis, or plan with no file changes, use `mode: \"plan\"`.",
    "Present the ranked result. Do not merge a candidate without the user's approval.",
  ]
}

function qaStep(qa: readonly AgentTeamModelRef[], after: "arena" | "self"): string[] {
  const subject =
    after === "arena"
      ? "After arena succeeds, have its top-ranked candidate reviewed. Give reviewers that candidate's actual diff against its base revision, its worktree or revision identity, and its verification results; do not substitute the main worktree's diff."
      : "Do the work yourself first. When it is complete, have it reviewed. Give reviewers the actual diff and verification results."
  return [
    `QA (${qa.length} ${qa.length === 1 ? "reviewer" : "reviewers"}): ${subject}`,
    `Call the **council** tool with \`kind: "review"\` and \`providers: ${providersArgument(qa)}\`.`,
    "- Set `question` to a concrete review question: does the work meet the user's request, is it correct, and does it risk regressions?",
    "- Put the evidence in `context`, within 24000 characters. If you had to leave material out, say what.",
    "- If the request changed no files, have the reviewers check your draft answer or analysis against the request instead.",
    "Weigh each finding against the evidence. Fix findings you can verify and that fall within what the user asked for, then re-verify; do not apply a change only because reviewers agree. Ask before anything that needs new authorization.",
  ]
}

/**
 * Turn the composer's team selection into what is actually sent.
 *
 * - no active role: nothing changes.
 * - one coder: that model runs the turn; no instructions are needed.
 * - two coders: the composer model orchestrates an arena between them.
 * - QA: a council review of the finished work by the selected models.
 *
 * The directive is a request to the lead model, not a guarantee: the runtime tools enforce their own
 * limits, and the lead is told to report a blocked step instead of working around it.
 */
export function resolveAgentTeamSend(team: AgentTeamState, lead: AgentTeamModelRef): AgentTeamSend {
  const coders = activeAgentTeamModels(team, "coder")
  const qa = activeAgentTeamModels(team, "qa")
  const runner = coders.length === 1 ? coders[0]! : lead
  const steps: string[][] = []
  if (coders.length >= 2) steps.push(coderStep(coders))
  if (qa.length > 0) steps.push(qaStep(qa, coders.length >= 2 ? "arena" : "self"))
  if (steps.length === 0) {
    return { providerID: runner.providerID, modelID: runner.modelID, directive: null }
  }
  const directive = [DIRECTIVE_HEADER, ...steps, DIRECTIVE_FOOTER].map((block) => block.join("\n")).join("\n\n")
  return { providerID: runner.providerID, modelID: runner.modelID, directive }
}

/** Model calls a send plans beyond the one that runs the turn. An upper bound, shown as the cost cue. */
export function agentTeamExtraModelCount(team: AgentTeamState): number {
  const coders = activeAgentTeamModels(team, "coder")
  return (coders.length >= 2 ? coders.length : 0) + activeAgentTeamModels(team, "qa").length
}
