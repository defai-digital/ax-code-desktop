/**
 * Suggest a Coder and QA team from what Desktop knows locally.
 *
 * This is a selection policy, not a quality ranking: there are no benchmark scores to rank by, so
 * the order follows what the user has told us (favorites, then recently used, then the model in the
 * composer) and the constraints the runtime enforces. It is deterministic, so the same catalog and
 * history always give the same suggestion and each pick can state its reason.
 */

import {
  AGENT_TEAM_LIMITS,
  AGENT_TEAM_MINIMUMS,
  COUNCIL_DEFAULT_MAX_MEMBERS,
  agentTeamBlockedReasonFor,
  isOrchestratingModel,
  isSameAgentTeamModel,
  type AgentTeamModelRef,
  type AgentTeamState,
} from "./agentTeam"

export interface AgentTeamCandidate extends AgentTeamModelRef {
  /**
   * Tool calling as the catalog states it: `undefined` when the catalog does not say. Coders edit
   * files and run commands, so they need it; a model is only ruled out of orchestrating when it is
   * known to lack it.
   */
  toolCall: boolean | undefined
  reasoning: boolean
  /** ISO date; used only to break ties. */
  releaseDate?: string
  /** Not usable right now (for example, too small for the agent's fixed prompt). */
  unavailable: boolean
}

export type AgentTeamSuggestionReason = "favorite" | "recent" | "lead" | "otherProvider" | "available"

export interface SuggestedAgentTeamModel extends AgentTeamModelRef {
  reason: AgentTeamSuggestionReason
}

export interface AgentTeamSuggestion {
  coder: SuggestedAgentTeamModel[]
  /** Empty when fewer than two reviewers remain: a one-member council cannot run. */
  qa: SuggestedAgentTeamModel[]
}

export interface AgentTeamSuggestInput {
  candidates: readonly AgentTeamCandidate[]
  /** In the user's order. */
  favorites: readonly AgentTeamModelRef[]
  /** Most recent first. */
  recents: readonly AgentTeamModelRef[]
  /** The model currently selected in the composer. */
  lead?: AgentTeamModelRef | null
}

interface Ranked {
  candidate: AgentTeamCandidate
  reason: AgentTeamSuggestionReason
  /** Lower sorts first: [tier, position within the tier]. */
  tier: number
  position: number
}

/**
 * The QA panel stops at council's default member limit. A larger panel is cut down by the runtime
 * unless the project raises the limit, so suggesting one would promise a reviewer that does not run.
 */
export const SUGGESTED_QA_COUNT = Math.min(AGENT_TEAM_LIMITS.qa, COUNCIL_DEFAULT_MAX_MEMBERS)

function indexOfModel(list: readonly AgentTeamModelRef[], model: AgentTeamModelRef): number {
  return list.findIndex((entry) => isSameAgentTeamModel(entry, model))
}

function rank(input: AgentTeamSuggestInput, candidate: AgentTeamCandidate): Ranked {
  const favorite = indexOfModel(input.favorites, candidate)
  if (favorite >= 0) return { candidate, reason: "favorite", tier: 0, position: favorite }
  const recent = indexOfModel(input.recents, candidate)
  if (recent >= 0) return { candidate, reason: "recent", tier: 1, position: recent }
  if (input.lead && isSameAgentTeamModel(input.lead, candidate)) {
    return { candidate, reason: "lead", tier: 2, position: 0 }
  }
  return { candidate, reason: "available", tier: 3, position: 0 }
}

/** Tie-breakers describe the model, not its quality; ids make the order total. */
function compareRanked(a: Ranked, b: Ranked): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.position !== b.position) return a.position - b.position
  if (a.candidate.reasoning !== b.candidate.reasoning) return a.candidate.reasoning ? -1 : 1
  const aDate = a.candidate.releaseDate ?? ""
  const bDate = b.candidate.releaseDate ?? ""
  if (aDate !== bDate) return aDate > bDate ? -1 : 1
  if (a.candidate.providerID !== b.candidate.providerID) {
    return a.candidate.providerID < b.candidate.providerID ? -1 : 1
  }
  if (a.candidate.modelID === b.candidate.modelID) return 0
  return a.candidate.modelID < b.candidate.modelID ? -1 : 1
}

/** A ranked pick and the reason shown for it. */
interface Seat {
  entry: Ranked
  reason: AgentTeamSuggestionReason
}

/** The picks before they become a suggestion; the repair pass edits these in place of the ranking. */
interface DraftTeam {
  coder: Seat[]
  qa: Seat[]
}

function toSuggested(seat: Seat): SuggestedAgentTeamModel {
  return { providerID: seat.entry.candidate.providerID, modelID: seat.entry.candidate.modelID, reason: seat.reason }
}

function toSeat(entry: Ranked, reason = entry.reason): Seat {
  return { entry, reason }
}

function toRef(seat: Seat): AgentTeamModelRef {
  return { providerID: seat.entry.candidate.providerID, modelID: seat.entry.candidate.modelID }
}

/** Whether a candidate can be handed the arena/council directive. */
function candidateOrchestrates(candidate: AgentTeamCandidate): boolean {
  return isOrchestratingModel(candidate.providerID, candidate.toolCall)
}

function suggestCoders(ranked: readonly Ranked[]): Seat[] {
  const eligible = ranked.filter((entry) => entry.candidate.toolCall === true)
  const first = eligible[0]
  if (!first) return []
  // Two coders are worth their cost when they are likely to differ, so prefer another provider.
  const rest = eligible.slice(1)
  const otherProvider = rest.find((entry) => entry.candidate.providerID !== first.candidate.providerID)
  const second = otherProvider ?? rest[0]
  if (!second) return [toSeat(first)]
  const reason = second === otherProvider && second.reason === "available" ? "otherProvider" : second.reason
  return [toSeat(first), toSeat(second, reason)]
}

function suggestQa(ranked: readonly Ranked[], authors: readonly AgentTeamModelRef[]): Seat[] {
  // A reviewer must not be an author. The same model id behind another provider is still the same
  // model, so match on the model id as well; unknown aliases cannot be detected from here.
  const authorModelIds = new Set(authors.map((author) => author.modelID))
  const pool = ranked.filter((entry) => !authorModelIds.has(entry.candidate.modelID))
  const picked: Ranked[] = []
  // An author's provider already has a voice, so reviewers from other providers are seated first.
  const seats = new Map<string, number>()
  for (const author of authors) seats.set(author.providerID, (seats.get(author.providerID) ?? 0) + 1)
  while (picked.length < SUGGESTED_QA_COUNT) {
    const remaining = pool.filter(
      (entry) => !picked.some((chosen) => chosen.candidate.modelID === entry.candidate.modelID),
    )
    if (remaining.length === 0) break
    // Fill from the provider with the fewest seats first: independent reviewers disagree usefully.
    const fewest = Math.min(...remaining.map((entry) => seats.get(entry.candidate.providerID) ?? 0))
    const next = remaining.find((entry) => (seats.get(entry.candidate.providerID) ?? 0) === fewest)!
    picked.push(next)
    seats.set(next.candidate.providerID, fewest + 1)
  }
  if (picked.length < AGENT_TEAM_MINIMUMS.qa) return []
  const authorProviders = new Set(authors.map((author) => author.providerID))
  return picked.map((entry) =>
    toSeat(
      entry,
      entry.reason === "available" && !authorProviders.has(entry.candidate.providerID) ? "otherProvider" : entry.reason,
    ),
  )
}

/** The team a sender would assemble from the draft, for the shared blocked-reason test. */
function draftTeam(draft: DraftTeam): AgentTeamState {
  const role = (seats: readonly Seat[]) => ({ enabled: seats.length > 0, models: seats.map(toRef) })
  return { coder: role(draft.coder), qa: role(draft.qa) }
}

/**
 * The orchestration test `agentTeamBlockedReasonFor` expects, answered from the candidates rather
 * than the raw catalog. A model the candidate list omits is not known to lack tool calling.
 */
function orchestratorFromCandidates(candidates: readonly AgentTeamCandidate[]) {
  const byRef = new Map(candidates.map((candidate) => [`${candidate.providerID}/${candidate.modelID}`, candidate]))
  return (model: AgentTeamModelRef): boolean => {
    const candidate = byRef.get(`${model.providerID}/${model.modelID}`)
    return candidate ? candidateOrchestrates(candidate) : isOrchestratingModel(model.providerID, undefined)
  }
}

interface ReplacementOptions {
  /** A coder edits files, so it also needs known tool calling; a reviewer does not. */
  coderSlot: boolean
  exclude: readonly Seat[]
  excludeModelIds?: ReadonlySet<string>
}

/** The best-ranked model that can orchestrate and is not already seated. */
function bestOrchestrator(ranked: readonly Ranked[], options: ReplacementOptions): Ranked | undefined {
  return ranked.find(
    (entry) =>
      candidateOrchestrates(entry.candidate) &&
      (!options.coderSlot || entry.candidate.toolCall === true) &&
      !(options.excludeModelIds?.has(entry.candidate.modelID) ?? false) &&
      !options.exclude.some((seat) => isSameAgentTeamModel(toRef(seat), entry.candidate)),
  )
}

/**
 * The coder to seat in place of one that cannot orchestrate. With two coders one is kept, and the
 * newcomer must be a different model: the same model id behind another provider would make the
 * arena compare a model with itself. The second coder is the first to give way, so the user's
 * top-ranked pick stays when either swap works.
 */
function repairCoders(coders: readonly Seat[], ranked: readonly Ranked[]): Seat[] | null {
  if (coders.length < 2) {
    const replacement = bestOrchestrator(ranked, { coderSlot: true, exclude: coders })
    return replacement ? [toSeat(replacement)] : null
  }
  for (const kept of [coders[0]!, coders[1]!]) {
    const replacement = bestOrchestrator(ranked, {
      coderSlot: true,
      exclude: coders,
      excludeModelIds: new Set([kept.entry.candidate.modelID]),
    })
    if (replacement) return [kept, toSeat(replacement)]
  }
  return null
}

/**
 * Keep a suggestion runnable. A team the sender would skip is not a suggestion, so swap in the
 * best-ranked model that can orchestrate, re-seat QA around a new author, and only leave the team
 * unchanged when the catalog holds nothing that can run the step.
 */
function repairDraftTeam(
  draft: DraftTeam,
  ranked: readonly Ranked[],
  isRunnable: (draft: DraftTeam) => boolean,
): DraftTeam {
  if (isRunnable(draft)) return draft
  const coder = repairCoders(draft.coder, ranked)
  if (coder) {
    // The new coder writes the code, so it cannot also review it.
    return { coder, qa: suggestQa(ranked, coder.map(toRef)) }
  }
  if (draft.coder.length < 2) {
    // Nothing here can orchestrate, so the QA step would be skipped: do not promise one.
    return { ...draft, qa: [] }
  }
  // A reviewer can orchestrate the arena or council it takes part in. It must be a model that is
  // neither an author nor already on the panel under another provider.
  const kept = draft.qa.slice(0, -1)
  const reviewer = bestOrchestrator(ranked, {
    coderSlot: false,
    exclude: [...draft.coder, ...draft.qa],
    excludeModelIds: new Set([...draft.coder, ...kept].map((seat) => seat.entry.candidate.modelID)),
  })
  if (reviewer && draft.qa.length > 0) {
    return { ...draft, qa: [...kept, toSeat(reviewer)] }
  }
  return draft
}

export function suggestAgentTeam(input: AgentTeamSuggestInput): AgentTeamSuggestion {
  const ranked = input.candidates
    .filter((candidate) => !candidate.unavailable && candidate.providerID.trim() && candidate.modelID.trim())
    .map((candidate) => rank(input, candidate))
    .sort(compareRanked)
  const coder = suggestCoders(ranked)
  // With no coder to suggest, the composer model writes the code and so cannot review it.
  const authors = coder.length > 0 ? coder.map(toRef) : input.lead ? [input.lead] : []
  let draft: DraftTeam = { coder, qa: suggestQa(ranked, authors) }
  if (input.lead) {
    const lead = input.lead
    const canOrchestrate = orchestratorFromCandidates(input.candidates)
    // With no coder, the model that runs the turn writes the code. A lead that cannot orchestrate
    // hands the turn to a reviewer, which would then review its own work: suggest no panel instead.
    if (draft.coder.length === 0 && !canOrchestrate(lead)) return { coder: [], qa: [] }
    const isRunnable = (candidate: DraftTeam) =>
      agentTeamBlockedReasonFor(draftTeam(candidate), lead, canOrchestrate) === null
    draft = repairDraftTeam(draft, ranked, isRunnable)
    // A team the send would still skip is not a suggestion at all.
    if (!isRunnable(draft)) return { coder: [], qa: [] }
  }
  return { coder: draft.coder.map(toSuggested), qa: draft.qa.map(toSuggested) }
}

/**
 * The team after accepting a suggestion. A role with nothing to suggest keeps what the user had, so
 * a catalog that cannot fill QA does not also clear a QA panel picked by hand.
 */
export function applyAgentTeamSuggestion(team: AgentTeamState, suggestion: AgentTeamSuggestion): AgentTeamState {
  const toRefs = (models: readonly SuggestedAgentTeamModel[]) =>
    models.map(({ providerID, modelID }) => ({ providerID, modelID }))
  return {
    coder: suggestion.coder.length > 0 ? { enabled: true, models: toRefs(suggestion.coder) } : team.coder,
    qa: suggestion.qa.length > 0 ? { enabled: true, models: toRefs(suggestion.qa) } : team.qa,
  }
}
