import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("./repo/index.js", () => ({
  resolveGitHubRepoFromDirectory: vi.fn(async () => ({ repo: { owner: "owner", repo: "repo" } })),
}))

const { resolveGitHubPrStatus } = await import("./pr-status.js")
const { getTrackingBranch } = await import("../git/index.js")

const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim()
const runGit = (cwd, args) => execFileSync(realGit, args, { cwd, encoding: "utf8" })

const octokit = {
  rest: {
    pulls: {
      list: vi.fn(async () => ({ data: [] })),
      get: vi.fn(async () => ({ data: {} })),
    },
    repos: { get: vi.fn(async () => ({ data: { default_branch: "main" } })) },
    search: { issuesAndPullRequests: vi.fn(async () => ({ data: { items: [] } })) },
  },
}

function createRepo({ upstream, upstreamBranch = "feature", pruneUpstream = false }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-status-tracking-"))
  runGit(dir, ["init"])
  runGit(dir, ["config", "user.name", "Test User"])
  runGit(dir, ["config", "user.email", "test@example.com"])
  fs.writeFileSync(path.join(dir, "tracked.txt"), "one\n")
  runGit(dir, ["add", "tracked.txt"])
  runGit(dir, ["commit", "-m", "initial"])
  runGit(dir, ["checkout", "-b", "feature"])
  runGit(dir, ["remote", "add", "origin", "https://github.com/owner/repo.git"])
  if (upstream) {
    runGit(dir, ["update-ref", `refs/remotes/origin/${upstreamBranch}`, "HEAD"])
    runGit(dir, ["branch", `--set-upstream-to=origin/${upstreamBranch}`, "feature"])
    // The remote branch was deleted (and the remote pruned) after the pull request merged.
    if (pruneUpstream) runGit(dir, ["update-ref", "-d", `refs/remotes/origin/${upstreamBranch}`])
  }
  fs.writeFileSync(path.join(dir, "tracked.txt"), "one\ntwo\n")
  fs.writeFileSync(path.join(dir, "untracked.txt"), "new\n")
  return dir
}

async function resolveWithRecordedArgv(directory) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-status-git-bin-"))
  const logPath = path.join(binDir, "argv.log")
  fs.writeFileSync(logPath, "")
  fs.writeFileSync(
    path.join(binDir, "git"),
    `#!/bin/sh\nprintf "%s\\n" "$*" >> "${logPath}"\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  )
  const previousPath = process.env.PATH
  process.env.PATH = `${binDir}${path.delimiter}${previousPath}`
  try {
    const result = await resolveGitHubPrStatus({ octokit, directory, branch: "feature" })
    const argv = fs.readFileSync(logPath, "utf8")
    return { result, argv }
  } finally {
    process.env.PATH = previousPath
    fs.rmSync(binDir, { recursive: true, force: true })
  }
}

describe("resolveGitHubPrStatus tracking lookup", () => {
  it("resolves the tracking remote without a full status for a repo with an upstream", async () => {
    const dir = createRepo({ upstream: true })
    try {
      const { result, argv } = await resolveWithRecordedArgv(dir)
      expect(result.repo).toEqual(expect.objectContaining({ owner: "owner", repo: "repo" }))
      expect(result.resolvedRemoteName).toBe("origin")
      expect(argv).toContain("upstream:short")
      expect(argv).not.toMatch(/diff|numstat|ls-tree|ls-files/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("keeps looking up the configured upstream branch after its remote ref was pruned", async () => {
    const dir = createRepo({ upstream: true, upstreamBranch: "feature-upstream", pruneUpstream: true })
    octokit.rest.pulls.list.mockClear()
    try {
      const { result, argv } = await resolveWithRecordedArgv(dir)
      expect(result.resolvedRemoteName).toBe("origin")
      expect(argv).not.toMatch(/diff|numstat|ls-tree|ls-files/)
      const heads = octokit.rest.pulls.list.mock.calls.map(([options]) => options.head)
      expect(heads).toContain("owner:feature-upstream")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("ignores the branch below an unborn HEAD's name", async () => {
    const dir = createRepo({ upstream: false })
    try {
      // HEAD becomes the unborn branch `orphan` while `orphan/sub` exists and tracks a remote branch;
      // the ref pattern for `orphan` also matches `orphan/sub`.
      runGit(dir, ["update-ref", "refs/remotes/origin/other", "HEAD"])
      runGit(dir, ["branch", "--track", "orphan/sub", "origin/other"])
      runGit(dir, ["checkout", "-q", "--orphan", "orphan"])
      expect(await getTrackingBranch(dir)).toBeNull()
      runGit(dir, ["checkout", "-q", "-f", "orphan/sub"])
      expect(await getTrackingBranch(dir)).toBe("origin/other")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("keeps tracking empty without a full status for a repo without an upstream", async () => {
    const dir = createRepo({ upstream: false })
    try {
      const { result, argv } = await resolveWithRecordedArgv(dir)
      expect(result.repo).toEqual(expect.objectContaining({ owner: "owner", repo: "repo" }))
      expect(result.resolvedRemoteName).toBe("origin")
      expect(argv).toContain("upstream:short")
      expect(argv).not.toMatch(/diff|numstat|ls-tree|ls-files/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
