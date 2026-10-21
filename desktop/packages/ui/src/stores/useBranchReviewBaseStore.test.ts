import { beforeEach, expect, test } from "vitest"

import { getSafeStorage } from "./utils/safeStorage"
import {
  BRANCH_REVIEW_BASE_MAX_DIRECTORIES,
  BRANCH_REVIEW_BASE_STORAGE_KEY,
  useBranchReviewBaseStore,
} from "./useBranchReviewBaseStore"

beforeEach(() => {
  useBranchReviewBaseStore.setState({ bases: {} })
})

test("restore ignores malformed preferences and bounds retained directories", async () => {
  const bases = Object.fromEntries(
    Array.from({ length: BRANCH_REVIEW_BASE_MAX_DIRECTORIES + 1 }, (_, index) => [`/repo${index}`, "main"]),
  )
  getSafeStorage().setItem(
    BRANCH_REVIEW_BASE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      state: {
        bases: {
          ...bases,
          "/empty": "",
          "/object": {},
          "/number": 12,
          "/space": " main",
          "/control": "a\0b",
          "/long": "x".repeat(1025),
        },
      },
    }),
  )
  await useBranchReviewBaseStore.persist.rehydrate()
  expect(Object.keys(useBranchReviewBaseStore.getState().bases)).toHaveLength(BRANCH_REVIEW_BASE_MAX_DIRECTORIES)
  expect(useBranchReviewBaseStore.getState().bases["/repo0"]).toBeUndefined()
  expect(useBranchReviewBaseStore.getState().bases["/repo1"]).toBe("main")
  expect(useBranchReviewBaseStore.getState().bases["/object"]).toBeUndefined()
})

test("remembering bases keeps the newest directories and clearing preserves other preferences", () => {
  const { setBase } = useBranchReviewBaseStore.getState()
  for (let index = 0; index <= BRANCH_REVIEW_BASE_MAX_DIRECTORIES; index += 1) setBase(`/repo${index}`, "main")
  expect(Object.keys(useBranchReviewBaseStore.getState().bases)).toHaveLength(BRANCH_REVIEW_BASE_MAX_DIRECTORIES)
  expect(useBranchReviewBaseStore.getState().bases["/repo0"]).toBeUndefined()
  setBase("/repo1", "feature")
  setBase("/repo2", null)
  setBase("/invalid", "bad\0branch")
  expect(useBranchReviewBaseStore.getState().bases["/repo1"]).toBe("feature")
  expect(useBranchReviewBaseStore.getState().bases["/repo2"]).toBeUndefined()
  expect(useBranchReviewBaseStore.getState().bases["/invalid"]).toBeUndefined()
})
