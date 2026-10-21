import { beforeEach, describe, expect, test, vi } from "vitest"
import { createJSONStorage } from "zustand/middleware"
import type { InlineCommentDraft } from "./useInlineCommentDraftStore"
import {
  MAX_REVIEW_THREAD_DIRECTORIES,
  MAX_REVIEW_THREAD_SNIPPET,
  MAX_REVIEW_THREADS,
  useReviewThreadStore,
} from "./useReviewThreadStore"

const draft = (id: string): InlineCommentDraft => ({
  id,
  sessionKey: "session-a",
  source: "diff",
  fileLabel: "src/a.ts",
  side: "original",
  startLine: 12,
  endLine: 13,
  code: "first()\nsecond()",
  language: "ts",
  text: `Review ${id}`,
  createdAt: 1,
})

describe("review thread persistence", () => {
  const storage = new Map<string, string>()
  beforeEach(() => {
    storage.clear()
    useReviewThreadStore.persist.setOptions({
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.get(name) ?? null,
        setItem: (name, value) => {
          storage.set(name, value)
        },
        removeItem: (name) => {
          storage.delete(name)
        },
      })),
    })
    useReviewThreadStore.setState({ threadsByDirectory: {} })
  })

  test("round-trips all thread fields, resolution and directory isolation through JSON storage", async () => {
    const store = useReviewThreadStore.getState()
    store.recordSent("/a", [draft("one")], "recipient-b")
    store.recordSent("/b", [draft("two")], "recipient-c")
    store.setStatus("/a", "one", "resolved")
    const expected = useReviewThreadStore.getState().threadsByDirectory
    const serialized = storage.get("ax-code-review-threads")!
    expect(JSON.parse(serialized).state.threadsByDirectory["/a"][0]).toMatchObject({
      ...draft("one"),
      recipientSessionId: "recipient-b",
      status: "resolved",
      sentAt: expect.any(Number),
    })
    useReviewThreadStore.setState({ threadsByDirectory: {} })
    storage.set("ax-code-review-threads", serialized)
    await useReviewThreadStore.persist.rehydrate()
    expect(useReviewThreadStore.getState().threadsByDirectory).toEqual(expected)
    useReviewThreadStore.getState().setStatus("/a", "one", "open")
    expect(useReviewThreadStore.getState().threadsByDirectory["/a"][0].status).toBe("open")
    expect(useReviewThreadStore.getState().threadsByDirectory["/b"]).toEqual(expected["/b"])
  })

  test("drops the oldest resolved threads before open threads, then oldest open threads", () => {
    const store = useReviewThreadStore.getState()
    store.recordSent(
      "/a",
      Array.from({ length: MAX_REVIEW_THREADS }, (_, i) => draft(String(i))),
      "recipient",
    )
    store.setStatus("/a", "50", "resolved")
    store.setStatus("/a", "51", "resolved")
    store.recordSent("/a", [draft("new-1"), draft("new-2"), draft("new-3")], "recipient")
    const threads = useReviewThreadStore.getState().threadsByDirectory["/a"]
    expect(threads).toHaveLength(MAX_REVIEW_THREADS)
    expect(threads.map((thread) => thread.id)).not.toContain("50")
    expect(threads.map((thread) => thread.id)).not.toContain("51")
    expect(threads.map((thread) => thread.id)).not.toContain("0")
    expect(threads.at(-1)?.id).toBe("new-3")
  })

  test("keeps both sent snapshots when an edited draft with the same id is sent later", () => {
    const store = useReviewThreadStore.getState()
    store.recordSent("/a", [draft("one")], "recipient")
    store.recordSent("/a", [{ ...draft("one"), text: "Updated comment" }], "recipient")
    const threads = useReviewThreadStore.getState().threadsByDirectory["/a"]
    expect(threads.map((thread) => thread.text)).toEqual(["Review one", "Updated comment"])
    expect(new Set(threads.map((thread) => thread.id)).size).toBe(2)
  })

  test("retains every draft sent from the summary bar, including mixed comment sources", async () => {
    useReviewThreadStore.getState().recordSent(
      "/a",
      [
        draft("diff"),
        {
          ...draft("file"),
          source: "file",
          side: undefined,
        },
      ],
      "recipient",
    )
    await useReviewThreadStore.persist.rehydrate()
    expect(useReviewThreadStore.getState().threadsByDirectory["/a"].map((thread) => thread.id)).toEqual([
      "diff",
      "file",
    ])
  })

  test("bounds restored data and rejects malformed records", async () => {
    const threads = Array.from({ length: MAX_REVIEW_THREADS + 2 }, (_, i) => ({
      ...draft(String(i)),
      recipientSessionId: "recipient",
      status: "open",
      sentAt: i,
    }))
    storage.set(
      "ax-code-review-threads",
      JSON.stringify({
        version: 1,
        state: {
          threadsByDirectory: {
            "/a": [...threads, { ...threads[0], startLine: -1 }, { id: "broken" }],
            "/b": "invalid",
          },
        },
      }),
    )
    await useReviewThreadStore.persist.rehydrate()
    expect(useReviewThreadStore.getState().threadsByDirectory["/a"]).toHaveLength(MAX_REVIEW_THREADS)
    expect(useReviewThreadStore.getState().threadsByDirectory["/a"][0].id).toBe("2")
    expect(useReviewThreadStore.getState().threadsByDirectory["/b"]).toBeUndefined()
  })

  test("keeps the most recently used repositories and caps the stored snippet", () => {
    vi.useFakeTimers()
    try {
      for (let index = 0; index <= MAX_REVIEW_THREAD_DIRECTORIES; index += 1) {
        vi.setSystemTime(1_000 + index)
        useReviewThreadStore.getState().recordSent(`/repo-${index}`, [draft(`d${index}`)], "recipient")
      }
      const directories = Object.keys(useReviewThreadStore.getState().threadsByDirectory)
      expect(directories).toHaveLength(MAX_REVIEW_THREAD_DIRECTORIES)
      expect(directories).not.toContain("/repo-0")
      expect(directories).toContain(`/repo-${MAX_REVIEW_THREAD_DIRECTORIES}`)

      useReviewThreadStore
        .getState()
        .recordSent("/big", [{ ...draft("big"), code: "x".repeat(MAX_REVIEW_THREAD_SNIPPET + 50) }], "recipient")
      expect(useReviewThreadStore.getState().threadsByDirectory["/big"]?.[0]?.code).toHaveLength(MAX_REVIEW_THREAD_SNIPPET)
    } finally {
      vi.useRealTimers()
    }
  })
})
