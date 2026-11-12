/**
 * Suggest a Coder and QA team from what Desktop knows locally.
 *
 * This is a selection policy, not a quality ranking: there are no benchmark scores to rank by. Each
 * role is ranked on its own, so a model that suits one role is not handed the other:
 *
 * 1. models the user already picked for that role come first, and a model picked for the other role
 *    is left to it;
 * 2. models whose name marks a small/fast tier or a router alias go last, because neither role is
 *    what they are for and an alias does not say which model answers; they fill a seat the team
 *    needs to run, never an optional one;
 * 3. then what the catalog and the name say about the role: a coding model or coding CLI for Coder,
 *    a reasoning model for QA;
 * 4. then what the user has told us (favorites, recently used, the model in the composer). These are
 *    kept for the whole composer, not per role, so they order models that suit the role rather than
 *    put one that does not ahead of one that does.
 *
 * It is deterministic, so the same catalog and history always give the same suggestion and each
 * pick can state its reason.
 */

import {
  AGENT_TEAM_LIMITS,
  AGENT_TEAM_MINIMUMS,
  COUNCIL_DEFAULT_MAX_MEMBERS,
  agentTeamBlockedReasonFor,
  isOrchestratingModel,
  isSameAgentTeamModel,
  type AgentTeamBlockedReason,
  type AgentTeamModelRef,
  type AgentTeamRole,
  type AgentTeamState,
} from "./agentTeam"
import { isExternalCliProvider } from "./providerModelAvailability"

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
  /** Display name; read with the id for the role hints a name carries. */
  name?: string
  /** Context window in tokens, when the catalog states it. */
  contextLimit?: number
  /** Not usable right now (for example, too small for the agent's fixed prompt). */
  unavailable: boolean
}

export type AgentTeamSuggestionReason =
  | "rolePick"
  | "favorite"
  | "recent"
  | "lead"
  | "codingModel"
  | "reasoningModel"
  | "otherProvider"
  | "available"

export interface SuggestedAgentTeamModel extends AgentTeamModelRef {
  reason: AgentTeamSuggestionReason
}

export interface AgentTeamSuggestion {
  coder: SuggestedAgentTeamModel[]
  /** Empty when fewer than two reviewers remain: a one-member council cannot run. */
  qa: SuggestedAgentTeamModel[]
  /**
   * Set when a panel was available but is left out because the suggested coder could not run it.
   * The coder is the user's first preference, so the panel gives way and the preview says why.
   */
  qaSkipped?: AgentTeamBlockedReason
}

export interface AgentTeamSuggestInput {
  candidates: readonly AgentTeamCandidate[]
  /** In the user's order. */
  favorites: readonly AgentTeamModelRef[]
  /** Most recent first. */
  recents: readonly AgentTeamModelRef[]
  /** The model currently selected in the composer. */
  lead?: AgentTeamModelRef | null
  /**
   * The team as it stands. A model the user put in a role is their own statement of what suits it,
   * so it outranks everything inferred here. Unticked roles count: their models are remembered picks.
   */
  team?: AgentTeamState | null
}

/** What a model's id and name say about it. Hints for ordering, never a claim about quality. */
export interface AgentTeamModelTraits {
  /** The model without its provider namespace and quantization: one key per underlying model. */
  family: string
  /** Named as a coding model (`coder`, `codex`, ...). */
  coding: boolean
  /** Named as a small or fast tier (`flash`, `mini`, `haiku`, ...). */
  light: boolean
  /** Named as a router alias (`auto`, `fusion`): the model that answers is not stated. */
  router: boolean
  /** Quantization width when the id states one; an id without one is taken as full precision. */
  precision: number
}

const CODING_TOKENS = new Set([
  "code",
  "coder",
  "coding",
  "codex",
  "codestral",
  "devstral",
  "codegemma",
  "codellama",
  "starcoder",
  "deepcoder",
])
const LIGHT_TOKENS = new Set([
  "flash",
  "mini",
  "nano",
  "lite",
  "haiku",
  "small",
  "tiny",
  "micro",
  "instant",
  "fast",
  "air",
])
const ROUTER_TOKENS = new Set(["auto", "fusion", "router"])
/** Packaging of one model, not a different model: quantization widths and weight formats. */
const QUANTIZATION_SEGMENT = /^(?:mxfp\d+|q\d+(?:_k(?:_[sml])?)?|\d+bit|fp\d+|int\d+|bf16|f16|gguf|mlx|axq|awq|gptq|exl2)$/
/** A context window this small cannot hold a repository task or the evidence a review is sent. */
const TIGHT_CONTEXT_TOKENS = 32_000

export function agentTeamModelTraits(modelID: string, name?: string): AgentTeamModelTraits {
  const id = modelID.trim().toLowerCase()
  // A gateway namespace (`nvidia/nemotron`) names the vendor, not another model.
  const bare = id.slice(id.lastIndexOf("/") + 1)
  const segments = bare.split(/[-:@]+/).filter(Boolean)
  const kept = segments.filter((segment) => !QUANTIZATION_SEGMENT.test(segment))
  const widths = segments
    .filter((segment) => QUANTIZATION_SEGMENT.test(segment))
    .map((segment) => Number(/\d+/.exec(segment)?.[0]))
    .filter((width) => Number.isFinite(width))
  const tokens = new Set(`${id} ${name?.toLowerCase() ?? ""}`.split(/[^a-z0-9]+/).filter(Boolean))
  const has = (words: ReadonlySet<string>) => [...tokens].some((token) => words.has(token))
  return {
    // An id made only of packaging segments keeps itself, so two such ids never collapse into one.
    family: kept.length > 0 ? kept.join("-") : bare,
    coding: has(CODING_TOKENS),
    light: has(LIGHT_TOKENS),
    router: has(ROUTER_TOKENS),
    precision: widths.length > 0 ? Math.max(...widths) : Number.POSITIVE_INFINITY,
  }
}

interface Ranked {
  candidate: AgentTeamCandidate
  traits: AgentTeamModelTraits
  reason: AgentTeamSuggestionReason
  /** Lower sorts first, compared left to right; the first `RANK_CLASS_LENGTH` entries are the class. */
  key: readonly number[]
  /** A small/fast tier or a router alias that the user did not pick for this role. */
  unsuited: boolean
  /** The user's own pick for this role. */
  rolePick: boolean
}

/** Standing with the user, suitability, and role fit: what a seat is decided on before history. */
const RANK_CLASS_LENGTH = 3

/**
 * The QA panel stops at council's default member limit. A larger panel is cut down by the runtime
 * unless the project raises the limit, so suggesting one would promise a reviewer that does not run.
 */
export const SUGGESTED_QA_COUNT = Math.min(AGENT_TEAM_LIMITS.qa, COUNCIL_DEFAULT_MAX_MEMBERS)

function indexOfModel(list: readonly AgentTeamModelRef[], model: AgentTeamModelRef): number {
  return list.findIndex((entry) => isSameAgentTeamModel(entry, model))
}

const HISTORY_TIER = { rolePick: 0, favorite: 1, recent: 2, lead: 3, none: 4 } as const

/** Where the user's own history puts a model for this role, and the reason that goes with it. */
function historyOf(
  input: AgentTeamSuggestInput,
  role: AgentTeamRole,
  candidate: AgentTeamCandidate,
): { tier: number; position: number; reason?: AgentTeamSuggestionReason } {
  const picked = indexOfModel(input.team?.[role].models ?? [], candidate)
  if (picked >= 0) return { tier: HISTORY_TIER.rolePick, position: picked, reason: "rolePick" }
  const favorite = indexOfModel(input.favorites, candidate)
  if (favorite >= 0) return { tier: HISTORY_TIER.favorite, position: favorite, reason: "favorite" }
  const recent = indexOfModel(input.recents, candidate)
  if (recent >= 0) return { tier: HISTORY_TIER.recent, position: recent, reason: "recent" }
  if (input.lead && isSameAgentTeamModel(input.lead, candidate)) {
    return { tier: HISTORY_TIER.lead, position: 0, reason: "lead" }
  }
  return { tier: HISTORY_TIER.none, position: 0 }
}

function rank(input: AgentTeamSuggestInput, role: AgentTeamRole, candidate: AgentTeamCandidate): Ranked {
  const traits = agentTeamModelTraits(candidate.modelID, candidate.name)
  const history = historyOf(input, role, candidate)
  const rolePick = history.tier === HISTORY_TIER.rolePick
  const otherRole: AgentTeamRole = role === "coder" ? "qa" : "coder"
  const pickedForOtherRole = !rolePick && indexOfModel(input.team?.[otherRole].models ?? [], candidate) >= 0
  // The user's own pick for the role is never second-guessed by what a name suggests.
  const unsuited = !rolePick && (traits.light || traits.router)
  // Catalogs write an unknown window as 0; only a stated one can be called small.
  const tightContext =
    candidate.contextLimit !== undefined && candidate.contextLimit > 0 && candidate.contextLimit < TIGHT_CONTEXT_TOKENS
  // A vendor coding CLI is a coding agent whatever its model is called. An alias named for coding
  // still does not say which model answers.
  const fits =
    role === "coder"
      ? (traits.coding || isExternalCliProvider(candidate.providerID)) && !traits.router
      : candidate.reasoning
  const fitReason: AgentTeamSuggestionReason = role === "coder" ? "codingModel" : "reasoningModel"
  return {
    candidate,
    traits,
    unsuited,
    rolePick,
    // The reason names what decided the seat: the role fit when there is one, else the history.
    reason: rolePick ? "rolePick" : fits && !unsuited ? fitReason : (history.reason ?? "available"),
    key: [
      rolePick ? 0 : pickedForOtherRole ? 2 : 1,
      unsuited ? 1 : 0,
      // The user's own picks keep the order they were given.
      rolePick || fits ? 0 : 1,
      history.tier,
      history.position,
      // Review is the reasoning-heavy role, so a coding model is seated after a general one; for a
      // coder the catalog's reasoning flag is the next thing known about the model.
      role === "coder" ? (candidate.reasoning ? 0 : 1) : traits.coding ? 1 : 0,
      tightContext ? 1 : 0,
    ],
  }
}

/** Tie-breakers describe the model, not its quality; ids make the order total. */
function compareRanked(a: Ranked, b: Ranked): number {
  for (let index = 0; index < a.key.length; index++) {
    if (a.key[index] !== b.key[index]) return a.key[index] - b.key[index]
  }
  const aDate = a.candidate.releaseDate ?? ""
  const bDate = b.candidate.releaseDate ?? ""
  if (aDate !== bDate) return aDate > bDate ? -1 : 1
  // Of two packagings of one model, the wider quantization stands for it.
  if (a.traits.precision !== b.traits.precision) return a.traits.precision > b.traits.precision ? -1 : 1
  if (a.candidate.providerID !== b.candidate.providerID) {
    return a.candidate.providerID < b.candidate.providerID ? -1 : 1
  }
  if (a.candidate.modelID === b.candidate.modelID) return 0
  return a.candidate.modelID < b.candidate.modelID ? -1 : 1
}

/** Candidates in suggestion order, once per role. */
type Rankings = Record<AgentTeamRole, readonly Ranked[]>

/**
 * Entries in the same class as the leading one. Provider variety is chosen among these, so it never
 * reaches past a model that suits the role for one that does not just because that one sits behind
 * another provider.
 */
function leadingClass(entries: readonly Ranked[]): Ranked[] {
  const first = entries[0]
  if (!first) return []
  return entries.filter((entry) => {
    for (let index = 0; index < RANK_CLASS_LENGTH; index++) if (entry.key[index] !== first.key[index]) return false
    return true
  })
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
  qaSkipped?: AgentTeamBlockedReason
}

function toSuggested(seat: Seat): SuggestedAgentTeamModel {
  return { providerID: seat.entry.candidate.providerID, modelID: seat.entry.candidate.modelID, reason: seat.reason }
}

function toSeat(entry: Ranked, reason = entry.reason): Seat {
  return { entry, reason }
}

function familyOf(model: AgentTeamModelRef): string {
  return agentTeamModelTraits(model.modelID).family
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
  // The same model behind another provider, or in another quantization, is still the same model,
  // and an arena that compares a model with itself is not worth its cost.
  const rest = eligible.slice(1).filter((entry) => entry.traits.family !== first.traits.family)
  const otherProvider = leadingClass(rest).find((entry) => entry.candidate.providerID !== first.candidate.providerID)
  const second = otherProvider ?? rest[0]
  // The second coder is optional, so it is never a small tier or an alias, whatever the first is.
  if (!second || second.unsuited) return [toSeat(first)]
  const reason = second === otherProvider && second.reason === "available" ? "otherProvider" : second.reason
  return [toSeat(first), toSeat(second, reason)]
}

function suggestQa(ranked: readonly Ranked[], authors: readonly AgentTeamModelRef[]): Seat[] {
  // A reviewer must not be an author. The same model behind another provider, or in another
  // quantization, is still the same model, so match on the family; unknown aliases cannot be
  // detected from here.
  const authorFamilies = new Set(authors.map(familyOf))
  const pool = ranked.filter((entry) => !authorFamilies.has(entry.traits.family))
  const picked: Ranked[] = []
  // An author's provider already has a voice, so reviewers from other providers are seated first.
  const seats = new Map<string, number>()
  for (const author of authors) seats.set(author.providerID, (seats.get(author.providerID) ?? 0) + 1)
  while (picked.length < SUGGESTED_QA_COUNT) {
    const remaining = leadingClass(
      pool.filter((entry) => !picked.some((chosen) => chosen.traits.family === entry.traits.family)),
    )
    if (remaining.length === 0) break
    // Seats past the minimum are optional, so they are not filled with a small tier or an alias.
    if (picked.length >= AGENT_TEAM_MINIMUMS.qa && remaining[0].unsuited) break
    // Fill from the provider with the fewest seats first: independent reviewers disagree usefully.
    // The user's own panel keeps the order they gave it.
    const fewest = Math.min(...remaining.map((entry) => seats.get(entry.candidate.providerID) ?? 0))
    const next = remaining[0].rolePick
      ? remaining[0]
      : remaining.find((entry) => (seats.get(entry.candidate.providerID) ?? 0) === fewest)!
    picked.push(next)
    seats.set(next.candidate.providerID, (seats.get(next.candidate.providerID) ?? 0) + 1)
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
  excludeFamilies?: ReadonlySet<string>
}

/** The best-ranked model that can orchestrate and is not already seated. */
function bestOrchestrator(ranked: readonly Ranked[], options: ReplacementOptions): Ranked | undefined {
  return ranked.find(
    (entry) =>
      candidateOrchestrates(entry.candidate) &&
      (!options.coderSlot || entry.candidate.toolCall === true) &&
      !(options.excludeFamilies?.has(entry.traits.family) ?? false) &&
      !options.exclude.some((seat) => isSameAgentTeamModel(toRef(seat), entry.candidate)),
  )
}

/**
 * The second coder's replacement when neither coder can orchestrate. The top-ranked coder is the
 * user's first preference and is never the one to give way. The newcomer must be a different model:
 * the same model id behind another provider would make the arena compare a model with itself.
 */
function replaceSecondCoder(coders: readonly Seat[], ranked: Rankings): Seat[] | null {
  const top = coders[0]
  if (!top || coders.length < 2) return null
  const replacement = bestOrchestrator(ranked.coder, {
    coderSlot: true,
    exclude: coders,
    excludeFamilies: new Set([top.entry.traits.family]),
  })
  return replacement ? [top, toSeat(replacement)] : null
}

/**
 * Keep a suggestion runnable without overriding the user's first choice. A team the sender would
 * skip is not a suggestion, so the pass gives up optional structure before it gives up the
 * top-ranked coder:
 *
 * - one coder that cannot run its QA panel keeps the coder and drops the panel, and says why;
 * - two coders with no orchestrator swap the second for one that can, else seat a reviewer that
 *   can, else fall back to the top coder alone.
 */
function repairDraftTeam(
  draft: DraftTeam,
  ranked: Rankings,
  isRunnable: (draft: DraftTeam) => boolean,
): DraftTeam {
  if (isRunnable(draft)) return draft
  if (draft.coder.length < 2) {
    // The coder cannot orchestrate, so the QA step would be skipped: do not promise one.
    return { ...draft, qa: [], qaSkipped: draft.qa.length > 0 ? "coderCannotRunQa" : undefined }
  }
  const coder = replaceSecondCoder(draft.coder, ranked)
  if (coder) {
    // The new coder writes the code, so it cannot also review it.
    return { coder, qa: suggestQa(ranked.qa, coder.map(toRef)) }
  }
  // A reviewer can orchestrate the arena or council it takes part in. It must be a model that is
  // neither an author nor already on the panel under another provider.
  const kept = draft.qa.slice(0, -1)
  const reviewer = bestOrchestrator(ranked.qa, {
    coderSlot: false,
    exclude: [...draft.coder, ...draft.qa],
    excludeFamilies: new Set([...draft.coder, ...kept].map((seat) => seat.entry.traits.family)),
  })
  if (reviewer && draft.qa.length > 0) {
    return { ...draft, qa: [...kept, toSeat(reviewer)] }
  }
  // Nothing can run an arena or a panel here. One coder is an ordinary turn on that model.
  return { coder: draft.coder.slice(0, 1), qa: [], qaSkipped: draft.qa.length > 0 ? "coderCannotRunQa" : undefined }
}

export function suggestAgentTeam(input: AgentTeamSuggestInput): AgentTeamSuggestion {
  const usable = input.candidates.filter(
    (candidate) => !candidate.unavailable && candidate.providerID.trim() && candidate.modelID.trim(),
  )
  const rankFor = (role: AgentTeamRole) => usable.map((candidate) => rank(input, role, candidate)).sort(compareRanked)
  const ranked: Rankings = { coder: rankFor("coder"), qa: rankFor("qa") }
  const draftFor = (coder: Seat[]): DraftTeam => {
    // With no coder to suggest, the composer model writes the code and so cannot review it.
    const authors = coder.length > 0 ? coder.map(toRef) : input.lead ? [input.lead] : []
    return { coder, qa: suggestQa(ranked.qa, authors) }
  }
  let draft = draftFor(suggestCoders(ranked.coder))
  const suitedReviewers = (team: DraftTeam) => team.qa.filter((seat) => !seat.entry.unsuited).length
  // Two coders the user picked themselves stay two coders: their pick is not moved to the panel.
  const secondCoderIsOwnPick = draft.coder[1]?.entry.rolePick === true
  if (draft.coder.length > 1 && !secondCoderIsOwnPick && suitedReviewers(draft) < AGENT_TEAM_MINIMUMS.qa) {
    // A second coder that uses up the reviewers costs the team its review, or leaves it to a small
    // tier. One coder with a panel checks the work; two coders without one only produce it twice.
    const reviewed = draftFor(draft.coder.slice(0, 1))
    // Only for a panel that suits the role: a suited second coder is not traded for a small tier.
    if (suitedReviewers(reviewed) >= AGENT_TEAM_MINIMUMS.qa) draft = reviewed
  }
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
    // With no panel to suggest, applying keeps the panel the user has. A suggested coder that
    // cannot run that panel would leave a team the send skips, so the panel is left out and says why.
    if (input.team && draft.coder.length > 0 && draft.qa.length === 0 && !draft.qaSkipped) {
      const kept: AgentTeamState = { ...draftTeam(draft), qa: input.team.qa }
      if (agentTeamBlockedReasonFor(kept, lead, canOrchestrate) === "coderCannotRunQa") {
        draft = { ...draft, qaSkipped: "coderCannotRunQa" }
      }
    }
  }
  return {
    coder: draft.coder.map(toSuggested),
    qa: draft.qa.map(toSuggested),
    ...(draft.qaSkipped ? { qaSkipped: draft.qaSkipped } : {}),
  }
}

/**
 * The team after accepting a suggestion. A role with nothing to suggest keeps what the user had, so
 * a catalog that cannot fill QA does not also clear a QA panel picked by hand. A panel the
 * suggestion left out on purpose (`qaSkipped`) is the exception: the suggested coder cannot run it.
 */
export function applyAgentTeamSuggestion(team: AgentTeamState, suggestion: AgentTeamSuggestion): AgentTeamState {
  const toRefs = (models: readonly SuggestedAgentTeamModel[]) =>
    models.map(({ providerID, modelID }) => ({ providerID, modelID }))
  return {
    coder: suggestion.coder.length > 0 ? { enabled: true, models: toRefs(suggestion.coder) } : team.coder,
    qa:
      suggestion.qa.length > 0
        ? { enabled: true, models: toRefs(suggestion.qa) }
        : suggestion.qaSkipped
          ? // The preview said the panel is left out, so it is unticked; its models are remembered.
            { ...team.qa, enabled: false }
          : team.qa,
  }
}
