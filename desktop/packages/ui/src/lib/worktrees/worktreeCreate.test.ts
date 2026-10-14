import { describe, expect, test } from "vitest"
import { resolveUpstreamBranchName } from "./worktreeCreate"

describe("resolveUpstreamBranchName", () => {
  test("strips a remote qualifier from a selected remote branch", () => {
    // Regression: "origin/foo" became the upstream branch, so the server configured
    // origin/origin/foo — a ref that does not exist.
    expect(resolveUpstreamBranchName("origin", "origin/foo")).toBe("foo")
  })

  test("keeps slashes that are part of the branch name", () => {
    expect(resolveUpstreamBranchName("origin", "feature/login")).toBe("feature/login")
  })

  test("keeps a branch whose prefix only looks like another remote", () => {
    expect(resolveUpstreamBranchName("origin", "upstream/foo")).toBe("upstream/foo")
  })

  test("normalizes ref prefixes before deciding", () => {
    expect(resolveUpstreamBranchName("origin", "refs/heads/origin/foo")).toBe("foo")
  })
})
