import { describe, expect, test } from "vitest"
import type { GitHubPullRequestSummary } from "@/lib/api/types"
import { normalizeBranchName, resolvePrWorktreeConfig } from "./prWorktreeConfig"

const pr = (overrides: Partial<GitHubPullRequestSummary> = {}): GitHubPullRequestSummary =>
  ({
    number: 12,
    title: "Add a thing",
    head: "feature/thing",
    headLabel: "someone:feature/thing",
    headRepo: { owner: "someone", sshUrl: "git@github.com:someone/repo.git", cloneUrl: "" },
    ...overrides,
  }) as GitHubPullRequestSummary

describe("resolvePrWorktreeConfig", () => {
  test("reuses a head branch that already exists locally", () => {
    const config = resolvePrWorktreeConfig(pr(), ["feature/thing"], [])

    expect(config.existingBranch).toBe("feature/thing")
    // Ownership fact: the worktree creation reuses this branch (no -b), so nothing
    // may delete it as if the flow had created it.
    expect(config.localBranchExists).toBe(true)
    expect(config.ensureRemoteName).toBeUndefined()
  })

  test("checks the head branch out from the remote that already has it", () => {
    const config = resolvePrWorktreeConfig(pr(), [], ["origin/feature/thing"])

    expect(config.existingBranch).toBe("remotes/origin/feature/thing")
    expect(config.localBranchExists).toBe(false)
    expect(config.setUpstream).toBe(true)
    expect(config.upstreamRemote).toBe("origin")
  })

  test("adds the PR head repository as a remote when neither local nor known", () => {
    const config = resolvePrWorktreeConfig(pr(), [], [])

    expect(config.existingBranch).toBe("remotes/pr-someone/feature/thing")
    expect(config.localBranchExists).toBe(false)
    expect(config.ensureRemoteName).toBe("pr-someone")
    expect(config.ensureRemoteUrl).toBe("git@github.com:someone/repo.git")
  })

  test("rejects a PR without a head branch", () => {
    expect(() => resolvePrWorktreeConfig(pr({ head: "  " }), [], [])).toThrow("PR head branch is missing")
  })
})

describe("normalizeBranchName", () => {
  test("strips refs/heads and collapses whitespace like the dialog always did", () => {
    expect(normalizeBranchName(" refs/heads/feature/x ")).toBe("feature/x")
    expect(normalizeBranchName("heads/feature x")).toBe("feature-x")
    expect(normalizeBranchName("/feature/")).toBe("feature")
  })
})
