export const PROMPT_HISTORY_LIMIT = 50

export type PromptRecallMode = "normal" | "shell"

export type PromptRecallPart = Record<string, unknown> & { type: string }

/** One stored prompt. `parts` is part of identity and is empty for desktop text submits. */
export type PromptRecallEntry = {
  input: string
  mode?: PromptRecallMode
  parts: PromptRecallPart[]
}

export type PromptRecallLoad = {
  history: PromptRecallEntry[]
  pending: PromptRecallEntry[]
}

/** A write that is still in flight, or has settled, for one directory. */
export type PendingPromptRecall = {
  entry: PromptRecallEntry
  /** Tick when the POST settled. Null while the write cannot be in a load that already started. */
  settledAt: number | null
}

const trimPromptEdges = (text: string) => text.replace(/^\n+|\n+$/g, "")

/**
 * Text worth storing. Queue comments, snippet expansion, and a queued resend are the caller's job:
 * this only accepts the newline-trimmed text the user typed.
 */
export function promptTextToRemember(input: {
  reason: "submit" | "queue-accept" | "queued-only" | "queue-refused"
  typed: string
}): string | null {
  if (input.reason !== "submit" && input.reason !== "queue-accept") return null
  const text = trimPromptEdges(input.typed)
  if (text.trim().length === 0) return null
  return text
}

/** Pending rows a load cannot have observed: the POST was still running, or settled after the load started. */
export function unseenPendingEntries(
  pending: readonly PendingPromptRecall[],
  loadStartedAt: number,
): PromptRecallEntry[] {
  return pending
    .filter((item) => item.settledAt === null || item.settledAt > loadStartedAt)
    .map((item) => item.entry)
}

export function retainUnseenPending(
  pending: readonly PendingPromptRecall[],
  loadStartedAt: number,
  stillPending: readonly PromptRecallEntry[],
): PendingPromptRecall[] {
  const unseen = pending.filter((item) => item.settledAt === null || item.settledAt > loadStartedAt)
  return unseen.slice(Math.max(0, unseen.length - stillPending.length))
}

const isMode = (value: unknown): value is PromptRecallMode => value === "normal" || value === "shell"

const isPart = (value: unknown): value is PromptRecallPart => {
  if (!value || typeof value !== "object") return false
  return typeof (value as { type?: unknown }).type === "string"
}

const recallKey = (entry: PromptRecallEntry) => JSON.stringify([entry.input, entry.mode ?? null, entry.parts])

const sameRecall = (left: PromptRecallEntry, right: PromptRecallEntry) => recallKey(left) === recallKey(right)

const normalizeEntry = (entry: PromptRecallEntry): PromptRecallEntry => ({
  input: entry.input,
  ...(entry.mode ? { mode: entry.mode } : {}),
  parts: entry.parts,
})

/** Oldest-first entries from GET /prompt-history. A non-array body is a failed load. */
export function parsePromptHistoryList(value: unknown): PromptRecallEntry[] | null {
  if (!Array.isArray(value)) return null
  const entries: PromptRecallEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const record = item as { input?: unknown; mode?: unknown; parts?: unknown }
    if (typeof record.input !== "string" || record.input.length === 0) continue
    if (record.mode !== undefined && !isMode(record.mode)) continue
    const parts = record.parts === undefined ? [] : record.parts
    if (!Array.isArray(parts) || !parts.every(isPart)) continue
    entries.push({
      input: record.input,
      ...(isMode(record.mode) ? { mode: record.mode } : {}),
      parts,
    })
  }
  return entries.length > PROMPT_HISTORY_LIMIT ? entries.slice(entries.length - PROMPT_HISTORY_LIMIT) : entries
}

/** Append in oldest-first order. A consecutive duplicate of input, mode, and parts is skipped. */
export function appendLocalRecall(
  history: readonly PromptRecallEntry[],
  entry: PromptRecallEntry,
): PromptRecallEntry[] {
  if (entry.input.length === 0) return [...history]
  const normalized = normalizeEntry(entry)
  const last = history[history.length - 1]
  if (last && sameRecall(last, normalized)) return [...history]
  const next = [...history, normalized]
  return next.length > PROMPT_HISTORY_LIMIT ? next.slice(next.length - PROMPT_HISTORY_LIMIT) : next
}

const isRecallSuffix = (history: readonly PromptRecallEntry[], prefix: readonly PromptRecallEntry[]) => {
  if (prefix.length === 0 || prefix.length > history.length) return false
  const start = history.length - prefix.length
  return prefix.every((entry, index) => sameRecall(history[start + index], entry))
}

/**
 * Fold prompts typed while a load was in flight onto the server list.
 * A pending prefix that the server already stored is not appended again.
 */
export function reconcilePromptRecall(
  serverOldest: readonly PromptRecallEntry[],
  pendingOldest: readonly PromptRecallEntry[],
): PromptRecallLoad {
  const server =
    serverOldest.length > PROMPT_HISTORY_LIMIT
      ? serverOldest.slice(serverOldest.length - PROMPT_HISTORY_LIMIT)
      : [...serverOldest]
  let drop = 0
  for (let length = pendingOldest.length; length > 0; length -= 1) {
    if (isRecallSuffix(server, pendingOldest.slice(0, length))) {
      drop = length
      break
    }
  }
  let history = server
  const pending = pendingOldest.slice(drop).map(normalizeEntry)
  for (const entry of pending) {
    history = appendLocalRecall(history, entry)
  }
  return { history, pending }
}

export function applyPromptHistoryLoad(input: {
  generation: number
  currentGeneration: number
  ok: boolean
  server: readonly PromptRecallEntry[]
  pending: readonly PromptRecallEntry[]
  previous: readonly PromptRecallEntry[]
}): PromptRecallLoad {
  if (input.generation !== input.currentGeneration || !input.ok) {
    return { history: [...input.previous], pending: [...input.pending] }
  }
  return reconcilePromptRecall(input.server, input.pending)
}

/** Newest-first list for ArrowUp. Project history wins; session text fills gaps the project store does not have. */
export function mergePromptRecall(input: {
  project: readonly PromptRecallEntry[]
  sessionTexts: readonly string[]
}): PromptRecallEntry[] {
  const seen = new Set(input.project.map((entry) => trimPromptEdges(entry.input)))
  const merged: PromptRecallEntry[] = []
  const push = (entry: PromptRecallEntry) => {
    if (entry.input.length === 0) return
    const last = merged[merged.length - 1]
    if (last && sameRecall(last, entry)) return
    merged.push(entry)
  }
  for (let index = input.project.length - 1; index >= 0; index -= 1) {
    push(input.project[index])
  }
  for (const text of input.sessionTexts) {
    const trimmed = trimPromptEdges(text)
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    push({ input: trimmed, parts: [] })
  }
  return merged.slice(0, PROMPT_HISTORY_LIMIT)
}

export type PromptRecallStep = {
  index: number
  draft: string
  draftMode: PromptRecallMode
  message: string
  mode: PromptRecallMode
  moved: boolean
}

const entryMode = (entry: PromptRecallEntry): PromptRecallMode => entry.mode ?? "normal"

/** Move through a newest-first list. Index -1 is the stashed live draft. */
export function stepPromptRecall(input: {
  history: readonly PromptRecallEntry[]
  index: number
  direction: "older" | "newer"
  draft: string
  draftMode: PromptRecallMode
  message: string
  mode: PromptRecallMode
}): PromptRecallStep | null {
  if (input.direction === "older") {
    if (input.history.length === 0) return null
    if (input.index < 0) {
      const entry = input.history[0]
      return {
        index: 0,
        draft: input.message,
        draftMode: input.mode,
        message: entry.input,
        mode: entryMode(entry),
        moved: true,
      }
    }
    if (input.index < input.history.length - 1) {
      const index = input.index + 1
      const entry = input.history[index]
      return {
        index,
        draft: input.draft,
        draftMode: input.draftMode,
        message: entry.input,
        mode: entryMode(entry),
        moved: true,
      }
    }
    return {
      index: input.index,
      draft: input.draft,
      draftMode: input.draftMode,
      message: input.message,
      mode: input.mode,
      moved: false,
    }
  }
  if (input.index < 0) return null
  if (input.index === 0) {
    return {
      index: -1,
      draft: "",
      draftMode: "normal",
      message: input.draft,
      mode: input.draftMode,
      moved: true,
    }
  }
  const index = input.index - 1
  const entry = input.history[index]
  return {
    index,
    draft: input.draft,
    draftMode: input.draftMode,
    message: entry.input,
    mode: entryMode(entry),
    moved: true,
  }
}

/** While browsing, keep the list that was on screen when ArrowUp started. */
export function promptRecallHistoryForNavigation(input: {
  live: readonly PromptRecallEntry[]
  browsing: readonly PromptRecallEntry[] | null
  index: number
}): readonly PromptRecallEntry[] {
  if (input.index >= 0 && input.browsing) return input.browsing
  return input.live
}
