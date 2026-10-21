import { describe, expect, test } from "vitest"
import { reviewDirectoryKey } from "./reviewDirectoryKey"
import { reviewProgressKey } from "@/stores/useReviewProgressStore"
import { branchReviewBase, useBranchReviewBaseStore } from "@/stores/useBranchReviewBaseStore"
import { selectReviewThreads, useReviewThreadStore } from "@/stores/useReviewThreadStore"

const draft = {
  id: "d1",
  sessionKey: "k",
  source: "diff" as const,
  fileLabel: "a.ts",
  startLine: 1,
  endLine: 1,
  side: "modified" as const,
  code: "x",
  language: "ts",
  text: "note",
  createdAt: 1,
}

describe("review state directory keys", () => {
  test("Windows spellings of one repository share one key; POSIX case stays distinct", () => {
    expect(reviewDirectoryKey("c:\\Work\\Repo")).toBe(reviewDirectoryKey("C:/Work/Repo"))
    expect(reviewDirectoryKey("/home/me/Repo")).not.toBe(reviewDirectoryKey("/home/me/repo"))
    expect(reviewProgressKey("C:\\Work\\Repo", "all", "a.ts")).toBe(reviewProgressKey("C:/Work/Repo", "all", "a.ts"))
  })

  test("threads and the branch base written under one spelling are read under the other", () => {
    useReviewThreadStore.setState({ threadsByDirectory: {} })
    useReviewThreadStore.getState().recordSent("C:\\Work\\Repo", [draft], "ses")
    expect(selectReviewThreads(useReviewThreadStore.getState(), "C:/Work/Repo")).toHaveLength(1)
    useBranchReviewBaseStore.setState({ bases: {} })
    useBranchReviewBaseStore.getState().setBase("c:\\Work\\Repo", "main")
    expect(branchReviewBase("C:/Work/Repo")).toBe("main")
  })
})
