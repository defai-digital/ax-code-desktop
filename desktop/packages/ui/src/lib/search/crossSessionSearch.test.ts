import { describe, expect, test, vi } from "vitest"
import type { Message, Part, Session } from "@defai-digital/ax-code-sdk/v2"
import {
  buildSnippet,
  createCrossSessionSearchCache,
  extractSearchableText,
  findSessionHits,
  normalizeSearchQuery,
  scanSessionsForQuery,
  selectSessionsToScan,
  toSearchableMessages,
  type CrossSessionSearchProgress,
} from "./crossSessionSearch"

const session = (overrides: Partial<Session> = {}): Session =>
  ({
    id: "ses_1",
    slug: "one",
    projectID: "proj_1",
    directory: "/repo",
    title: "Session one",
    version: "1",
    time: { created: 100, updated: 200 },
    ...overrides,
  }) as Session

const textPart = (text: string, extra: Record<string, unknown> = {}): Part =>
  ({ id: "prt_1", sessionID: "ses_1", messageID: "msg_1", type: "text", text, ...extra }) as Part

const record = (role: "user" | "assistant", parts: Part[], id = "msg_1", created = 1000) => ({
  info: { id, sessionID: "ses_1", role, time: { created } } as Message,
  parts,
})

describe("selectSessionsToScan", () => {
  test("sorts newest first, drops archived and child sessions, and bounds the list", () => {
    const sessions = [
      session({ id: "ses_old", time: { created: 1, updated: 10 } }),
      session({ id: "ses_new", time: { created: 1, updated: 30 } }),
      session({ id: "ses_mid", time: { created: 1, updated: 20 } }),
      session({ id: "ses_child", parentID: "ses_new", time: { created: 1, updated: 40 } }),
      session({ id: "ses_archived", time: { created: 1, updated: 50, archived: 60 } }),
      session({ id: "ses_new", time: { created: 1, updated: 30 } }),
    ]

    expect(selectSessionsToScan(sessions, 2).map((item) => item.id)).toEqual(["ses_new", "ses_mid"])
  })
})

describe("extractSearchableText", () => {
  test("keeps text parts only, skipping tool output, reasoning and synthetic parts", () => {
    const parts = [
      textPart("Hello\n  world"),
      { id: "prt_2", type: "reasoning", text: "secret chain" } as unknown as Part,
      { id: "prt_3", type: "tool", state: { output: "tool output" } } as unknown as Part,
      textPart("injected reminder", { synthetic: true }),
      textPart("again"),
    ]

    expect(extractSearchableText(parts)).toBe("Hello world again")
  })
})

describe("toSearchableMessages and findSessionHits", () => {
  test("matches case-insensitively across whitespace and returns a highlighted snippet", () => {
    const messages = toSearchableMessages([
      record("user", [textPart("Please fix the\nFlaky Test in CI")], "msg_1", 111),
      record("assistant", [textPart("Nothing relevant here")], "msg_2", 222),
    ])

    const hits = findSessionHits(session(), messages, normalizeSearchQuery("  flaky   test "))

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ messageId: "msg_1", role: "user", created: 111, sessionTitle: "Session one" })
    expect(hits[0].snippet.match).toBe("Flaky Test")
    expect(hits[0].snippet.before).toBe("Please fix the ")
    expect(hits[0].snippet.after).toBe(" in CI")
  })

  test("returns one hit per message even with repeated matches", () => {
    const messages = toSearchableMessages([record("assistant", [textPart("retry, retry, retry")])])
    expect(findSessionHits(session(), messages, "retry")).toHaveLength(1)
  })

  test("drops messages without searchable text", () => {
    const messages = toSearchableMessages([
      record("assistant", [{ id: "prt_9", type: "tool" } as unknown as Part]),
      record("user", [textPart("   ")]),
    ])
    expect(messages).toEqual([])
  })
})

describe("buildSnippet", () => {
  test("marks ellipses when context is clipped on either side", () => {
    const text = `${"a".repeat(60)}NEEDLE${"b".repeat(60)}`
    const snippet = buildSnippet(text, 60, 6, 10)

    expect(snippet.leadingEllipsis).toBe(true)
    expect(snippet.trailingEllipsis).toBe(true)
    expect(snippet.before).toHaveLength(10)
    expect(snippet.match).toBe("NEEDLE")
    expect(snippet.after).toHaveLength(10)
  })
})

describe("createCrossSessionSearchCache", () => {
  test("hits only while the session updated stamp is unchanged", () => {
    const cache = createCrossSessionSearchCache()
    const messages = toSearchableMessages([record("user", [textPart("cached words")])])
    cache.set(session(), messages)

    expect(cache.get(session())).toEqual(messages)
    expect(cache.get(session({ time: { created: 100, updated: 999 } }))).toBeUndefined()
  })

  test("evicts the least recently used session past the bound", () => {
    const cache = createCrossSessionSearchCache(2)
    const messages = toSearchableMessages([record("user", [textPart("words")])])
    cache.set(session({ id: "ses_a" }), messages)
    cache.set(session({ id: "ses_b" }), messages)
    // Reading ses_a makes ses_b the eviction candidate.
    expect(cache.get(session({ id: "ses_a" }))).toBeDefined()
    cache.set(session({ id: "ses_c" }), messages)

    expect(cache.get(session({ id: "ses_b" }))).toBeUndefined()
    expect(cache.get(session({ id: "ses_a" }))).toBeDefined()
    expect(cache.get(session({ id: "ses_c" }))).toBeDefined()
  })
})

describe("scanSessionsForQuery", () => {
  const sessions = [
    session({ id: "ses_1", title: "One" }),
    session({ id: "ses_2", title: "Two" }),
    session({ id: "ses_3", title: "Three" }),
  ]

  test("reports progressive snapshots and sorts hits newest first", async () => {
    const progress: CrossSessionSearchProgress[] = []
    const result = await scanSessionsForQuery({
      sessions,
      query: "deploy",
      fetchMessages: async (item) => [
        record(
          "assistant",
          [textPart(`deploy notes for ${item.id}`)],
          `msg_${item.id}`,
          item.id === "ses_2" ? 300 : 100,
        ),
      ],
      onProgress: (snapshot) => progress.push(snapshot),
    })

    expect(progress.map((item) => item.scanned)).toEqual([1, 2, 3])
    expect(result.scanned).toBe(3)
    // ses_1 and ses_3 tie on message time; the tie breaks by message id, newest first.
    expect(result.hits.map((hit) => hit.sessionId)).toEqual(["ses_2", "ses_3", "ses_1"])
  })

  test("counts a failed session fetch and keeps scanning the rest", async () => {
    const result = await scanSessionsForQuery({
      sessions,
      query: "deploy",
      fetchMessages: async (item) => {
        if (item.id === "ses_2") throw new Error("boom")
        return [record("user", [textPart("deploy it")], `msg_${item.id}`)]
      },
    })

    expect(result.failed).toBe(1)
    expect(result.scanned).toBe(3)
    expect(result.hits).toHaveLength(2)
  })

  test("reuses cached sessions instead of fetching again", async () => {
    const cache = createCrossSessionSearchCache()
    const fetchMessages = vi.fn(async (item: Session) => [record("user", [textPart("deploy it")], `msg_${item.id}`)])

    await scanSessionsForQuery({ sessions, query: "deploy", fetchMessages, cache })
    await scanSessionsForQuery({ sessions, query: "deploy", fetchMessages, cache })

    expect(fetchMessages).toHaveBeenCalledTimes(3)
  })

  test("stops fetching new sessions once aborted", async () => {
    const controller = new AbortController()
    const fetchMessages = vi.fn(async (item: Session) => {
      controller.abort()
      return [record("user", [textPart("deploy it")], `msg_${item.id}`)]
    })

    const result = await scanSessionsForQuery({
      sessions,
      query: "deploy",
      fetchMessages,
      concurrency: 1,
      signal: controller.signal,
    })

    expect(result.aborted).toBe(true)
    expect(fetchMessages).toHaveBeenCalledTimes(1)
    expect(result.scanned).toBeLessThan(3)
  })

  test("caps results and flags truncation", async () => {
    const result = await scanSessionsForQuery({
      sessions,
      query: "deploy",
      maxResults: 2,
      fetchMessages: async (item) => [record("user", [textPart("deploy it")], `msg_${item.id}`)],
    })

    expect(result.hits).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  test("never exceeds the concurrency bound", async () => {
    let inFlight = 0
    let peak = 0
    await scanSessionsForQuery({
      sessions: Array.from({ length: 9 }, (_, index) => session({ id: `ses_${index}` })),
      query: "deploy",
      concurrency: 3,
      fetchMessages: async (item) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return [record("user", [textPart("deploy it")], `msg_${item.id}`)]
      },
    })

    expect(peak).toBe(3)
  })
  test("highlights the query when a code point before it lowercases to a longer string", () => {
    // The index came from `text.toLowerCase()` while the snippet sliced `text`: `İ` (U+0130) lowercases to two
    // code units, so every offset after it was shifted and the highlighted text was not the query.
    const hits = findSessionHits(
      session(),
      [{ messageId: "msg_1", role: "user", created: 1000, text: "İİ needle" }],
      "needle",
    )

    expect(hits).toHaveLength(1)
    expect(hits[0].snippet.match).toBe("needle")
  })

  test("finds a text whose own lowercasing is longer than it is", () => {
    // `İ` lowercases to two characters, so a fixed-width window over the original text can never equal the
    // lowercased query: searching for the word that *is* the message found nothing.
    const hits = findSessionHits(session(), [{ messageId: "msg_1", role: "user", created: 1000, text: "İstanbul" }], "i\u0307stanbul")

    expect(hits).toHaveLength(1)
    expect(hits[0].snippet.match).toBe("İstanbul")
  })
})
