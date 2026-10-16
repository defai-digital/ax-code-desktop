import { beforeEach, describe, expect, test } from "vitest"
import {
  buildInlineCommentSessionKey,
  toRestorableInlineCommentDraft,
  useInlineCommentDraftStore,
} from "./useInlineCommentDraftStore"

const makeDraft = (sessionKey: string, text: string) => ({
  sessionKey,
  source: "diff" as const,
  fileLabel: "src/app.ts",
  startLine: 1,
  endLine: 1,
  code: "const value = 1",
  language: "ts",
  text,
})

describe("inline comment draft keys", () => {
  beforeEach(() => {
    useInlineCommentDraftStore.setState({ drafts: {} })
  })

  test("uses active session id before draft scope", () => {
    expect(
      buildInlineCommentSessionKey({
        sessionId: " ses_123 ",
        draftDirectory: "/repo/a",
      }),
    ).toBe("ses_123")
  })

  test("scopes new-session draft keys by normalized directory", () => {
    expect(buildInlineCommentSessionKey({ draftDirectory: "/repo/a/" })).toBe("draft:/repo/a")
    expect(buildInlineCommentSessionKey({ draftDirectory: "/repo/b" })).toBe("draft:/repo/b")
    expect(buildInlineCommentSessionKey({ draftDirectory: "C:\\repo\\a\\" })).toBe("draft:C:/repo/a")
  })

  test("falls back to project id when a draft has no directory", () => {
    expect(buildInlineCommentSessionKey({ draftProjectId: "proj_123" })).toBe("draft:project:proj_123")
  })

  test("keeps draft buckets isolated by scoped key", () => {
    const store = useInlineCommentDraftStore.getState()
    const firstKey = buildInlineCommentSessionKey({ draftDirectory: "/repo/a" })
    const secondKey = buildInlineCommentSessionKey({ draftDirectory: "/repo/b" })

    if (!firstKey || !secondKey) {
      throw new Error("Expected scoped draft keys")
    }

    store.addDraft(makeDraft(firstKey, "review a"))
    store.addDraft(makeDraft(secondKey, "review b"))

    expect(
      useInlineCommentDraftStore
        .getState()
        .getDrafts(firstKey)
        .map((draft) => draft.text),
    ).toEqual(["review a"])
    expect(
      useInlineCommentDraftStore
        .getState()
        .getDrafts(secondKey)
        .map((draft) => draft.text),
    ).toEqual(["review b"])
    expect(useInlineCommentDraftStore.getState().getDrafts("draft")).toEqual([])
  })
})

describe("restoring consumed drafts", () => {
  beforeEach(() => {
    useInlineCommentDraftStore.setState({ drafts: {} })
  })

  test("carries every persisted field of a consumed draft back into the store", () => {
    // A submit that never went through (a refused queue entry, a failed send) has to put the
    // drafts it consumed back. They are the only copy left, so a field the restore forgets is
    // a silent loss of what the user wrote.
    const store = useInlineCommentDraftStore.getState()
    const key = "ses_restore"
    const allFields = {
      sessionKey: key,
      source: "diff" as const,
      fileLabel: "src/app.ts",
      startLine: 12,
      endLine: 18,
      side: "modified" as const,
      code: "const value = 1",
      language: "ts",
      text: "this needs a guard",
    }
    store.addDraft(allFields)

    const [consumed] = store.consumeDrafts(key)
    expect(consumed).toBeTruthy()
    useInlineCommentDraftStore.getState().addDraft(toRestorableInlineCommentDraft(consumed))

    const [restored] = useInlineCommentDraftStore.getState().getDrafts(key)
    expect(restored).toMatchObject(allFields)
    expect(restored?.id).not.toBe(consumed.id)
  })
})
