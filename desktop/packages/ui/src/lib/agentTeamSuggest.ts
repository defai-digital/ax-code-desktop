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
  isSameAgentTeamModel,
  type AgentTeamModelRef,
  type AgentTeamState,
} from "./agentTeam"

export interface AgentTeamCandidate extends AgentTeamModelRef {
  /** Coders edit files and run commands, so they must support tool calling. */
  toolCall: boolean
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

function toSuggested(entry: Ranked, reason = entry.reason): SuggestedAgentTeamModel {
  return { providerID: entry.candidate.providerID, modelID: entry.candidate.modelID, reason }
}

function suggestCoders(ranked: readonly Ranked[]): SuggestedAgentTeamModel[] {
  const eligible = ranked.filter((entry) => entry.candidate.toolCall)
  const first = eligible[0]
  if (!first) return []
  // Two coders are worth their cost when they are likely to differ, so prefer another provider.
  const rest = eligible.slice(1)
  const otherProvider = rest.find((entry) => entry.candidate.providerID !== first.candidate.providerID)
  const second = otherProvider ?? rest[0]
  if (!second) return [toSuggested(first)]
  const reason = second === otherProvider && second.reason === "available" ? "otherProvider" : second.reason
  return [toSuggested(first), toSuggested(second, reason)]
}

function suggestQa(ranked: readonly Ranked[], authors: readonly AgentTeamModelRef[]): SuggestedAgentTeamModel[] {
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
    toSuggested(
      entry,
      entry.reason === "available" && !authorProviders.has(entry.candidate.providerID) ? "otherProvider" : entry.reason,
    ),
  )
}

export function suggestAgentTeam(input: AgentTeamSuggestInput): AgentTeamSuggestion {
  const ranked = input.candidates
    .filter((candidate) => !candidate.unavailable && candidate.providerID.trim() && candidate.modelID.trim())
    .map((candidate) => rank(input, candidate))
    .sort(compareRanked)
  const coder = suggestCoders(ranked)
  // With no coder to suggest, the composer model writes the code and so cannot review it.
  const authors = coder.length > 0 ? coder : input.lead ? [input.lead] : []
  return { coder, qa: suggestQa(ranked, authors) }
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
