import { describe, expect, test, vi } from "vitest"
import type { GitAPI, GitStatus } from "@/lib/api/types"
import { dict } from "@/lib/i18n/messages/en"
import type { I18nContextValue } from "@/lib/i18n/react-context"
import { commitChanges, pushChanges } from "./landingActions"

const t: I18nContextValue["t"] = (key) => dict[key]
function setup() {
  const status: GitStatus = {
    current: "topic",
    tracking: "origin/topic",
    ahead: 1,
    behind: 0,
    files: [],
    isClean: true,
  }
  const createGitCommit = vi.fn(async () => ({}))
  const gitPush = vi.fn(async () => ({}))
  const gitFetch = vi.fn(async () => ({}))
  const getGitStatus = vi.fn(async () => status)
  const git = { createGitCommit, gitPush, gitFetch, getGitStatus } as unknown as GitAPI
  return { git, status, createGitCommit, gitPush, gitFetch, getGitStatus }
}

describe("shared landing actions", () => {
  test("retains Git panel commit-all behavior and trims the message", async () => {
    const { git, createGitCommit } = setup()
    await commitChanges({
      git,
      directory: "/repo",
      message: " fix: all ",
      stagedPaths: [],
      changedPaths: ["b", "a"],
      t,
    })
    expect(createGitCommit).toHaveBeenCalledWith("/repo", "fix: all", { files: ["a", "b"], stageFiles: ["a", "b"] })
  })

  test("uses staged content without restaging partially staged files", async () => {
    const { git, createGitCommit } = setup()
    await commitChanges({
      git,
      directory: "/repo",
      message: "fix: index",
      stagedPaths: ["a"],
      changedPaths: ["a", "b"],
      t,
    })
    expect(createGitCommit).toHaveBeenCalledWith("/repo", "fix: index", { files: ["a"], stageFiles: [] })
  })

  test("both entry points validate messages; review cannot fall back to commit-all", async () => {
    const { git, createGitCommit } = setup()
    const options = { git, directory: "/repo", message: "   ", stagedPaths: ["a"], changedPaths: ["b"], t }
    await expect(commitChanges(options)).rejects.toThrow("Enter a commit message")
    await expect(
      commitChanges({ ...options, message: "fix", stagedPaths: [], allowCommitAll: false }),
    ).rejects.toThrow()
    expect(createGitCommit).not.toHaveBeenCalled()
  })

  test("keeps the SyncActions push request and never pushes when fetch discovers it is up to date", async () => {
    const { git, status, gitPush } = setup()
    await expect(pushChanges({ git, directory: "/repo", remote: "origin", t })).resolves.toBe("pushed")
    expect(gitPush).toHaveBeenCalledWith("/repo", { remote: "origin" })
    status.ahead = 0
    await expect(pushChanges({ git, directory: "/repo", remote: "origin", t })).resolves.toBe("upToDate")
    expect(gitPush).toHaveBeenCalledTimes(1)
  })

  test.each(["current", "tracking", "ahead"] as const)(
    "requires another review when %s changes after fetch",
    async (field) => {
      const { git, status, gitPush } = setup()
      const expected = { ...status }
      if (field === "ahead") status.ahead = 2
      else status[field] = "other"
      await expect(pushChanges({ git, directory: "/repo", remote: "origin", t, expected })).rejects.toThrow(
        "Repository state changed",
      )
      expect(gitPush).not.toHaveBeenCalled()
    },
  )
})
