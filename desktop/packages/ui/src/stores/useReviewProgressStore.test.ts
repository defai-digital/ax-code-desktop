import { beforeEach, describe, expect, test } from "vitest"

import { getSafeStorage } from "./utils/safeStorage"
import {
  REVIEW_PROGRESS_MAX_MARKS,
  REVIEW_PROGRESS_STORAGE_KEY,
  REVIEW_PROGRESS_STORAGE_VERSION,
  reviewBranchFileSignature,
  reviewContentSignature,
  reviewFileSignature,
  reviewFileSignatureDetail,
  useReviewProgressStore,
  type ReviewProgressFile,
} from "./useReviewProgressStore"

const directory = "/repo"
const scope = "working"

const file = (patch: Partial<ReviewProgressFile> = {}): ReviewProgressFile => ({
  path: "src/a.ts",
  index: "M",
  working_dir: " ",
  insertions: 2,
  deletions: 5,
  ...patch,
})

const HEAD = "a".repeat(40)
const INDEX = "b".repeat(40)
const WORKTREE = "c".repeat(40)
const WORKTREE_REWRITTEN = "d".repeat(40)
const MERGE_BASE = "e".repeat(40)
const BEFORE_BLOB = "f".repeat(40)

describe("useReviewProgressStore", () => {
  beforeEach(async () => {
    useReviewProgressStore.persist.clearStorage()
    useReviewProgressStore.setState({ marks: {} })
    await useReviewProgressStore.persist.rehydrate()
    useReviewProgressStore.setState({ marks: {} })
  })

  test("a changed signature clears viewed", () => {
    const current = file()
    const signature = reviewFileSignature(current)
    expect(signature).toBe("2:5:M:M ")

    useReviewProgressStore.getState().setViewed(directory, scope, current.path, signature, true)
    expect(useReviewProgressStore.getState().isViewed(directory, scope, current.path, signature)).toBe(true)

    const edited = reviewFileSignature(file({ insertions: 9 }))
    const statusChanged = reviewFileSignature(file({ index: "A" }))
    expect(edited).toBe("9:5:M:M ")
    expect(statusChanged).toBe("2:5:A:A ")
    expect(useReviewProgressStore.getState().isViewed(directory, scope, current.path, edited)).toBe(false)
    expect(useReviewProgressStore.getState().isViewed(directory, scope, current.path, statusChanged)).toBe(false)
    expect(useReviewProgressStore.getState().isViewed(directory, scope, current.path, signature)).toBe(true)
  })

  test("toggleViewed flips the current signature and clearDirectory keeps other directories", () => {
    const signature = reviewFileSignature(file())
    const { toggleViewed, setViewed, clearDirectory, isViewed } = useReviewProgressStore.getState()

    toggleViewed(directory, scope, "src/a.ts", signature)
    expect(isViewed(directory, scope, "src/a.ts", signature)).toBe(true)
    expect(isViewed(directory, "staged", "src/a.ts", signature)).toBe(false)

    toggleViewed(directory, scope, "src/a.ts", signature)
    expect(isViewed(directory, scope, "src/a.ts", signature)).toBe(false)

    setViewed(directory, scope, "src/a.ts", signature, true)
    setViewed("/repo-other", scope, "src/a.ts", signature, true)
    clearDirectory(directory)
    expect(useReviewProgressStore.getState().isViewed(directory, scope, "src/a.ts", signature)).toBe(false)
    expect(useReviewProgressStore.getState().isViewed("/repo-other", scope, "src/a.ts", signature)).toBe(true)

    setViewed("/repo-other", scope, "src/a.ts", signature, false)
    expect(useReviewProgressStore.getState().isViewed("/repo-other", scope, "src/a.ts", signature)).toBe(false)
  })

  test("moving a change between the index and the working tree needs a new review", () => {
    const staged = file({ index: "M", working_dir: " " })
    useReviewProgressStore.getState().setViewed(directory, "all", staged.path, reviewFileSignature(staged), true)
    const unstaged = file({ index: " ", working_dir: "M" })
    expect(useReviewProgressStore.getState().isViewed(directory, "all", unstaged.path, reviewFileSignature(unstaged))).toBe(
      false,
    )
  })

  test("a rewrite with the same line counts changes the content signature", () => {
    const status = "modified"
    const first = reviewContentSignature("const value = 1\n", status)
    const rewritten = reviewContentSignature("const value = 2\n", status)
    expect(first).not.toBe(rewritten)
    expect(reviewContentSignature("const value = 1\n", status)).toBe(first)
    expect(reviewContentSignature("const value = 1\n", "added")).not.toBe(first)

    useReviewProgressStore.getState().setViewed(directory, "session", "src/a.ts", first, true)
    expect(useReviewProgressStore.getState().isViewed(directory, "session", "src/a.ts", first)).toBe(true)
    expect(useReviewProgressStore.getState().isViewed(directory, "session", "src/a.ts", rewritten)).toBe(false)
    expect(useReviewProgressStore.getState().isViewed(directory, "turn:msg_1", "src/a.ts", first)).toBe(false)
  })

  test("a same-count rewrite clears viewed when the worktree id changes", () => {
    const current = file({
      insertions: 1,
      deletions: 1,
      index: " ",
      working_dir: "M",
      headBlobId: HEAD,
      indexBlobId: INDEX,
      worktreeBlobId: WORKTREE,
    })
    const signed = reviewFileSignatureDetail(current, "working")
    expect(signed.fallback).toBe(false)
    expect(signed.signature).toContain(current.path)
    expect(signed.signature).toContain(INDEX)
    expect(signed.signature).toContain(WORKTREE)
    expect(signed.signature).not.toContain(HEAD)

    useReviewProgressStore.getState().setViewed(directory, "working", current.path, signed.signature, true)
    expect(useReviewProgressStore.getState().isViewed(directory, "working", current.path, signed.signature)).toBe(true)

    const rewritten = file({ ...current, worktreeBlobId: WORKTREE_REWRITTEN })
    expect(rewritten.insertions).toBe(current.insertions)
    expect(rewritten.deletions).toBe(current.deletions)
    const rewrittenSignature = reviewFileSignature(rewritten, "working")
    expect(rewrittenSignature).not.toBe(signed.signature)
    expect(useReviewProgressStore.getState().isViewed(directory, "working", current.path, rewrittenSignature)).toBe(
      false,
    )

    const staged = reviewFileSignatureDetail(
      file({ index: "M", working_dir: " ", headBlobId: HEAD, indexBlobId: INDEX, worktreeBlobId: null }),
      "staged",
    )
    expect(staged.fallback).toBe(false)
    useReviewProgressStore.getState().setViewed(directory, "staged", current.path, staged.signature, true)
    const restaged = reviewFileSignature(
      file({ index: "M", working_dir: " ", headBlobId: HEAD, indexBlobId: WORKTREE_REWRITTEN, worktreeBlobId: null }),
      "staged",
    )
    expect(restaged).not.toBe(staged.signature)
    expect(useReviewProgressStore.getState().isViewed(directory, "staged", current.path, restaged)).toBe(false)
  })

  test("missing blob ids fall back to the count signature and mark the row", () => {
    const missing = reviewFileSignatureDetail(file(), "working")
    expect(missing.fallback).toBe(true)
    expect(missing.signature).toBe("2:5:M:M ")

    const oversized = reviewFileSignatureDetail(
      file({ index: " ", working_dir: "M", headBlobId: HEAD, indexBlobId: INDEX, worktreeBlobId: null }),
      "all",
    )
    expect(oversized.fallback).toBe(true)
    expect(oversized.signature).toBe(reviewFileSignature(file({ index: " ", working_dir: "M" })))

    const deleted = reviewFileSignatureDetail(
      file({
        index: " ",
        working_dir: "D",
        insertions: 0,
        deletions: 3,
        headBlobId: HEAD,
        indexBlobId: INDEX,
        worktreeBlobId: null,
      }),
      "working",
    )
    expect(deleted.fallback).toBe(false)
    expect(deleted.signature).toContain(INDEX)
    expect(deleted.signature).toContain("-")
  })

  test("a branch rewrite with equal counts clears viewed, and a missing before blob falls back", () => {
    const current = reviewBranchFileSignature(
      {
        path: "src/a.ts",
        status: "modified",
        after: "const value = 1\n",
        additions: 1,
        deletions: 1,
        beforeBlobId: BEFORE_BLOB,
      },
      MERGE_BASE,
    )
    expect(current.fallback).toBe(false)
    expect(current.signature).toContain(MERGE_BASE)
    expect(current.signature).toContain(BEFORE_BLOB)

    const rewritten = reviewBranchFileSignature(
      {
        path: "src/a.ts",
        status: "modified",
        after: "const value = 2\n",
        additions: 1,
        deletions: 1,
        beforeBlobId: BEFORE_BLOB,
      },
      MERGE_BASE,
    )
    expect(rewritten.signature).not.toBe(current.signature)
    useReviewProgressStore.getState().setViewed(directory, "branch:main", "src/a.ts", current.signature, true)
    expect(useReviewProgressStore.getState().isViewed(directory, "branch:main", "src/a.ts", current.signature)).toBe(
      true,
    )
    expect(useReviewProgressStore.getState().isViewed(directory, "branch:main", "src/a.ts", rewritten.signature)).toBe(
      false,
    )

    const fallback = reviewBranchFileSignature(
      {
        path: "src/a.ts",
        status: "modified",
        after: "const value = 1\n",
        additions: 1,
        deletions: 1,
      },
      MERGE_BASE,
    )
    expect(fallback.fallback).toBe(true)
    expect(fallback.signature).toBe(reviewContentSignature("const value = 1\n", "modified"))
  })

  test("reloads persisted marks and leaves a changed signature unviewed", async () => {
    const current = file({ headBlobId: HEAD, indexBlobId: INDEX, worktreeBlobId: WORKTREE })
    const signature = reviewFileSignature(current, "all")
    useReviewProgressStore.getState().setViewed(directory, "all", current.path, signature, true)
    useReviewProgressStore.getState().setViewed(directory, "branch:main", current.path, signature, true)

    const saved = getSafeStorage().getItem(REVIEW_PROGRESS_STORAGE_KEY)
    const parsed = JSON.parse(saved ?? "{}") as { version?: number; state?: { marks?: Record<string, string> } }
    expect(parsed.version).toBe(REVIEW_PROGRESS_STORAGE_VERSION)
    expect(Object.values(parsed.state?.marks ?? {})).toContain(signature)

    useReviewProgressStore.setState({ marks: {} })
    expect(useReviewProgressStore.getState().isViewed(directory, "all", current.path, signature)).toBe(false)
    getSafeStorage().setItem(REVIEW_PROGRESS_STORAGE_KEY, saved ?? "")
    await useReviewProgressStore.persist.rehydrate()

    expect(useReviewProgressStore.getState().isViewed(directory, "all", current.path, signature)).toBe(true)
    expect(useReviewProgressStore.getState().isViewed(directory, "branch:main", current.path, signature)).toBe(true)
    const rewritten = reviewFileSignature(file({ ...current, worktreeBlobId: WORKTREE_REWRITTEN }), "all")
    expect(useReviewProgressStore.getState().isViewed(directory, "all", current.path, rewritten)).toBe(false)
    expect(useReviewProgressStore.getState().isViewed("/repo-other", "all", current.path, signature)).toBe(false)
  })

  test("keeps at most the newest marks", () => {
    const { setViewed } = useReviewProgressStore.getState()
    for (let index = 0; index <= REVIEW_PROGRESS_MAX_MARKS; index++) setViewed(directory, scope, `f${index}`, "s", true)
    const { marks, isViewed } = useReviewProgressStore.getState()
    expect(Object.keys(marks)).toHaveLength(REVIEW_PROGRESS_MAX_MARKS)
    expect(isViewed(directory, scope, "f0", "s")).toBe(false)
    expect(isViewed(directory, scope, `f${REVIEW_PROGRESS_MAX_MARKS}`, "s")).toBe(true)
  })

  test("binary or oversized branch rows always use the marked fallback", () => {
    const row = {
      path: "img.png",
      status: "modified",
      after: "",
      additions: 0,
      deletions: 0,
      beforeBlobId: "c".repeat(40),
    }
    const base = "d".repeat(40)
    expect(reviewBranchFileSignature({ ...row, binary: true }, base).fallback).toBe(true)
    expect(reviewBranchFileSignature({ ...row, tooLarge: true }, base).fallback).toBe(true)
    expect(reviewBranchFileSignature({ ...row, after: "text\n", additions: 1 }, base).fallback).toBe(false)
  })
})
