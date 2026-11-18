import { describe, expect, test } from "vitest"
import { restoreCachedPullRequestStatus } from "./cachedPullRequestStatus"

const valid = {
  connected: true,
  repo: { owner: "owner", repo: "repo", url: "https://example.com/repo" },
  pr: {
    number: 1,
    title: "Review",
    url: "https://example.com/pull/1",
    state: "open",
    draft: false,
    base: "main",
    head: "feature",
  },
  checks: { state: "success", total: 1, success: 1, failure: 0, pending: 0 },
}
describe("cached PR data boundary", () => {
  test("keeps valid API data, including disconnected/no-PR outcomes", () => {
    expect(restoreCachedPullRequestStatus(valid)).toEqual(valid)
    expect(restoreCachedPullRequestStatus({ connected: false, pr: null })).toEqual({ connected: false, pr: null })
  })
  test.each([
    null,
    [],
    "bad",
    {},
    { ...valid, pr: { ...valid.pr, title: {} } },
    { ...valid, checks: { ...valid.checks, pending: "one" } },
    { ...valid, repo: { owner: 42 } },
    { ...valid, canMerge: "yes" },
    { ...valid, resolvedRemoteName: {} },
  ])("refuses malformed cached fields %j", (value) => {
    expect(restoreCachedPullRequestStatus(value)).toBeNull()
  })
})
