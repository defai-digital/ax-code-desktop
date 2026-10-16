import type { Message, Part, Session } from "@defai-digital/ax-code-sdk/v2"
import { setBoundedCacheEntry } from "@/lib/boundedCache"

/**
 * Client-side cross-session message search.
 *
 * The runtime has no content-search endpoint, so the dialog scans the most
 * recent sessions of the current project by loading each session's messages
 * through the existing SDK client and matching locally. This module holds the
 * pure pieces (text extraction, matching, snippet building, the bounded scan
 * scheduler and its per-session cache) so they can be tested without the SDK.
 */

/** How many of the project's most recent sessions a scan covers. */
export const CROSS_SESSION_SEARCH_MAX_SESSIONS = 50
/** How many sessions are fetched in parallel while scanning. */
export const CROSS_SESSION_SEARCH_CONCURRENCY = 4
/** Upper bound on returned hits so a common word cannot flood the list. */
export const CROSS_SESSION_SEARCH_MAX_RESULTS = 200
/** Messages requested per session; the SDK caps `limit` at 500. */
export const CROSS_SESSION_SEARCH_MESSAGES_LIMIT = 500
/** Characters of context kept on each side of a match in a snippet. */
export const CROSS_SESSION_SEARCH_SNIPPET_CONTEXT = 48
/** Sessions whose extracted text is kept for cheap re-searches. */
export const CROSS_SESSION_SEARCH_CACHE_MAX = 60

export type SearchableMessage = {
  messageId: string
  role: "user" | "assistant"
  created: number
  /** Whitespace-normalized text-part content, ready for substring matching. */
  text: string
}

export type CrossSessionSearchSnippet = {
  before: string
  match: string
  after: string
  leadingEllipsis: boolean
  trailingEllipsis: boolean
}

export type CrossSessionSearchHit = {
  sessionId: string
  sessionTitle: string
  sessionDirectory: string
  messageId: string
  role: "user" | "assistant"
  created: number
  snippet: CrossSessionSearchSnippet
}

export type CrossSessionSearchProgress = {
  hits: CrossSessionSearchHit[]
  scanned: number
  total: number
  failed: number
  truncated: boolean
}

export type CrossSessionSearchResult = CrossSessionSearchProgress & {
  aborted: boolean
}

type SessionMessageRecord = { info: Message; parts: Part[] }

/** Collapse runs of whitespace so matches and snippets stay on one line. */
export const normalizeSearchText = (text: string): string => text.replace(/\s+/g, " ").trim()

/**
 * Index of `needle` (already lowercased) in `text`, or -1.
 *
 * The lowercased text is built code point by code point while remembering where each folded character came
 * from, because lowercasing can *lengthen* a string (`İ` becomes two characters): a fixed-width window over the
 * original cannot match `needle` there, and the answer still has to be an index into `text` for the snippet.
 */
const findCaseInsensitiveIndex = (text: string, needle: string): number => {
  if (!needle) {
    return -1
  }
  let folded = ""
  const originalIndexes: number[] = []
  for (let index = 0; index < text.length; ) {
    const character = String.fromCodePoint(text.codePointAt(index) ?? 0)
    const lowered = character.toLowerCase()
    for (let offset = 0; offset < lowered.length; offset += 1) {
      originalIndexes.push(index)
    }
    folded += lowered
    index += character.length
  }
  const found = folded.indexOf(needle)
  return found === -1 ? -1 : (originalIndexes[found] ?? -1)
}

const sessionUpdatedAt = (session: Session): number =>
  (typeof session.time?.updated === "number" ? session.time.updated : 0) ||
  (typeof session.time?.created === "number" ? session.time.created : 0)

/**
 * The sessions a scan covers: root, non-archived sessions, newest first,
 * bounded to `limit`. Directory/project scoping happens in the caller's
 * `session.list` query; this only normalizes whatever list it produced.
 */
export const selectSessionsToScan = (
  sessions: ReadonlyArray<Session>,
  limit: number = CROSS_SESSION_SEARCH_MAX_SESSIONS,
): Session[] => {
  const seen = new Set<string>()
  const eligible: Session[] = []
  for (const session of sessions) {
    if (!session?.id || seen.has(session.id)) continue
    if (session.parentID) continue
    if (typeof session.time?.archived === "number") continue
    seen.add(session.id)
    eligible.push(session)
  }
  eligible.sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))
  return eligible.slice(0, Math.max(0, limit))
}

/**
 * Searchable text of a message: its text parts only. Tool output and
 * reasoning live in other part types and are skipped, as are synthetic text
 * parts (injected context the user never typed or read as a reply).
 */
export const extractSearchableText = (parts: ReadonlyArray<Part>): string => {
  const texts: string[] = []
  for (const part of parts) {
    if (part?.type !== "text" || typeof part.text !== "string") continue
    if (part.synthetic) continue
    texts.push(part.text)
  }
  return normalizeSearchText(texts.join("\n"))
}

/** Reduce raw session message records to the shape matching needs. */
export const toSearchableMessages = (records: ReadonlyArray<SessionMessageRecord>): SearchableMessage[] => {
  const messages: SearchableMessage[] = []
  for (const record of records) {
    const role = record?.info?.role
    if (role !== "user" && role !== "assistant") continue
    const text = extractSearchableText(record.parts ?? [])
    if (!text) continue
    messages.push({
      messageId: record.info.id,
      role,
      created: typeof record.info.time?.created === "number" ? record.info.time.created : 0,
      text,
    })
  }
  return messages
}

export const buildSnippet = (
  text: string,
  matchIndex: number,
  matchLength: number,
  contextChars: number = CROSS_SESSION_SEARCH_SNIPPET_CONTEXT,
): CrossSessionSearchSnippet => {
  const start = Math.max(0, matchIndex - contextChars)
  const end = Math.min(text.length, matchIndex + matchLength + contextChars)
  return {
    before: text.slice(start, matchIndex),
    match: text.slice(matchIndex, matchIndex + matchLength),
    after: text.slice(matchIndex + matchLength, end),
    leadingEllipsis: start > 0,
    trailingEllipsis: end < text.length,
  }
}

/**
 * One hit per matching message (its first occurrence), case-insensitive.
 * `normalizedQuery` must already be normalized and lower-cased by the caller
 * via {@link normalizeSearchQuery}.
 */
export const findSessionHits = (
  session: Session,
  messages: ReadonlyArray<SearchableMessage>,
  normalizedQuery: string,
): CrossSessionSearchHit[] => {
  if (!normalizedQuery) return []
  const hits: CrossSessionSearchHit[] = []
  for (const message of messages) {
    // Index into the text as it will be sliced: lowercasing can change a string's length (`İ` becomes two code
    // units), and the index used to come from the lowercased copy while the snippet sliced the original — the
    // highlight and its ellipses landed a few characters off.
    const matchIndex = findCaseInsensitiveIndex(message.text, normalizedQuery)
    if (matchIndex === -1) continue
    hits.push({
      sessionId: session.id,
      sessionTitle: session.title ?? "",
      sessionDirectory: session.directory ?? "",
      messageId: message.messageId,
      role: message.role,
      created: message.created,
      snippet: buildSnippet(message.text, matchIndex, normalizedQuery.length),
    })
  }
  return hits
}

export const normalizeSearchQuery = (query: string): string => normalizeSearchText(query).toLowerCase()

const compareHitsNewestFirst = (a: CrossSessionSearchHit, b: CrossSessionSearchHit): number => {
  if (b.created !== a.created) return b.created - a.created
  return a.messageId < b.messageId ? 1 : a.messageId > b.messageId ? -1 : 0
}

/**
 * Per-session cache of extracted searchable messages, keyed by session id and
 * the session's `time.updated` stamp. A session that gained messages since it
 * was cached has a newer stamp and is fetched again; an unchanged session is
 * re-searched from memory.
 */
export interface CrossSessionSearchCache {
  get: (session: Session) => SearchableMessage[] | undefined
  set: (session: Session, messages: SearchableMessage[]) => void
  clear: () => void
}

const cacheKeyForSession = (session: Session): string =>
  `${session.id}\u0000${typeof session.time?.updated === "number" ? session.time.updated : 0}`

export const createCrossSessionSearchCache = (
  maxEntries: number = CROSS_SESSION_SEARCH_CACHE_MAX,
): CrossSessionSearchCache => {
  const entries = new Map<string, SearchableMessage[]>()
  return {
    get: (session) => {
      const key = cacheKeyForSession(session)
      const cached = entries.get(key)
      if (cached === undefined) return undefined
      // Mark most-recently-used so active sessions survive eviction.
      entries.delete(key)
      entries.set(key, cached)
      return cached
    },
    set: (session, messages) => {
      setBoundedCacheEntry(entries, maxEntries, cacheKeyForSession(session), messages)
    },
    clear: () => entries.clear(),
  }
}

export type ScanSessionsOptions = {
  sessions: ReadonlyArray<Session>
  query: string
  fetchMessages: (session: Session, signal: AbortSignal) => Promise<SessionMessageRecord[]>
  cache?: CrossSessionSearchCache
  concurrency?: number
  maxResults?: number
  signal?: AbortSignal
  onProgress?: (progress: CrossSessionSearchProgress) => void
}

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")

/**
 * Scan sessions in order with a bounded worker pool, emitting progressive
 * snapshots as each session finishes. A session whose fetch fails is counted
 * in `failed` and skipped; aborting stops new fetches and resolves with
 * whatever was collected so far.
 */
export const scanSessionsForQuery = async (options: ScanSessionsOptions): Promise<CrossSessionSearchResult> => {
  const normalizedQuery = normalizeSearchQuery(options.query)
  const sessions = options.sessions
  const total = sessions.length
  const maxResults = Math.max(1, options.maxResults ?? CROSS_SESSION_SEARCH_MAX_RESULTS)
  const signal = options.signal

  const hits: CrossSessionSearchHit[] = []
  let scanned = 0
  let failed = 0
  let truncated = false

  const snapshot = (): CrossSessionSearchProgress => ({
    hits: [...hits].sort(compareHitsNewestFirst).slice(0, maxResults),
    scanned,
    total,
    failed,
    truncated,
  })

  if (!normalizedQuery || total === 0) {
    return { ...snapshot(), aborted: Boolean(signal?.aborted) }
  }

  let cursor = 0
  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) return
      const index = cursor
      cursor += 1
      if (index >= total) return
      const session = sessions[index]

      let messages = options.cache?.get(session)
      if (messages === undefined) {
        try {
          const records = await options.fetchMessages(session, signal ?? new AbortController().signal)
          messages = toSearchableMessages(records)
          options.cache?.set(session, messages)
        } catch (error) {
          if (signal?.aborted || isAbortError(error)) return
          failed += 1
          scanned += 1
          options.onProgress?.(snapshot())
          continue
        }
      }
      if (signal?.aborted) return

      const sessionHits = findSessionHits(session, messages, normalizedQuery)
      if (sessionHits.length > 0) {
        hits.push(...sessionHits)
        if (hits.length > maxResults) truncated = true
      }
      scanned += 1
      options.onProgress?.(snapshot())
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency ?? CROSS_SESSION_SEARCH_CONCURRENCY, total))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return { ...snapshot(), aborted: Boolean(signal?.aborted) }
}
