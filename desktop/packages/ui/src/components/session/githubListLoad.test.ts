import { describe, expect, test, vi } from "vitest"

import type { GitHubIssuesListResult, GitHubPullRequestsListResult } from "@/lib/api/types"
import { loadCurrentGitHubList } from "./githubListLoad"

const issueListResult: GitHubIssuesListResult = {
  connected: true,
  issues: [
    {
      number: 7,
      title: "Fix project picker",
      url: "https://github.com/acme/repo/issues/7",
      state: "open",
    },
  ],
  page: 1,
  hasMore: false,
}

const prListResult: GitHubPullRequestsListResult = {
  connected: true,
  prs: [
    {
      number: 1,
      title: "Fix login",
      url: "https://github.com/acme/repo/pull/1",
      head: "fix-login",
      base: "main",
      state: "open",
      draft: false,
    },
  ],
  page: 1,
  hasMore: false,
}

const listResults: [string, GitHubIssuesListResult | GitHubPullRequestsListResult][] = [
  ["issue list", issueListResult],
  ["PR list", prListResult],
]

describe("loadCurrentGitHubList", () => {
  test.each(listResults)("returns the loaded %s for the current request", async (_label, listResult) => {
    await expect(
      loadCurrentGitHubList({
        load: vi.fn(async () => listResult),
        isCurrent: () => true,
      }),
    ).resolves.toEqual({ status: "loaded", result: listResult })
  })

  test("returns current request errors", async () => {
    const error = new Error("load failed")

    await expect(
      loadCurrentGitHubList({
        load: vi.fn(async () => {
          throw error
        }),
        isCurrent: () => true,
      }),
    ).resolves.toEqual({ status: "failed", error })
  })

  test.each(listResults)("suppresses stale %s responses", async (_label, listResult) => {
    await expect(
      loadCurrentGitHubList({
        load: vi.fn(async () => listResult),
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ status: "stale" })
  })

  test("suppresses errors from stale requests", async () => {
    const error = new Error("project changed")

    await expect(
      loadCurrentGitHubList({
        load: vi.fn(async () => {
          throw error
        }),
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ status: "stale" })
  })
})
