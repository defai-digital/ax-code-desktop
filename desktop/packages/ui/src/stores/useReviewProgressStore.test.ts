import { beforeEach, describe, expect, test } from "vitest"

import {
  REVIEW_PROGRESS_MAX_MARKS,
  reviewFileSignature,
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

describe("useReviewProgressStore", () => {
  beforeEach(() => {
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

  test("keeps at most the newest marks", () => {
    const { setViewed } = useReviewProgressStore.getState()
    for (let index = 0; index <= REVIEW_PROGRESS_MAX_MARKS; index++) setViewed(directory, scope, `f${index}`, "s", true)
    const { marks, isViewed } = useReviewProgressStore.getState()
    expect(Object.keys(marks)).toHaveLength(REVIEW_PROGRESS_MAX_MARKS)
    expect(isViewed(directory, scope, "f0", "s")).toBe(false)
    expect(isViewed(directory, scope, `f${REVIEW_PROGRESS_MAX_MARKS}`, "s")).toBe(true)
  })
})
