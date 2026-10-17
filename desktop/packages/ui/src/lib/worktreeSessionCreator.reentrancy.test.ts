import { afterEach, describe, expect, test, vi } from "vitest"

const { checkIsGitRepositoryMock } = vi.hoisted(() => ({
  checkIsGitRepositoryMock: vi.fn(),
}))

vi.mock("@/lib/gitApi", () => ({
  checkIsGitRepository: (...args: unknown[]) => checkIsGitRepositoryMock(...args),
  previewGitWorktree: vi.fn(),
}))

vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({
      getActiveProject: () => ({ id: "proj_1", path: "/repo" }),
    }),
  },
}))

afterEach(() => {
  vi.resetModules()
  checkIsGitRepositoryMock.mockReset()
})

describe("createWorktreeSession re-entrancy", () => {
  test("refuses a second press while the first is still checking the repository", async () => {
    // The guard was read at the top of the function and set after `await checkIsGitRepository`, and both the
    // keyboard shortcut and the menu item call this without awaiting: two presses in the same tick both passed it
    // and each went on to create a worktree and a branch, with one draft target between them. The second press is
    // now answered immediately.
    checkIsGitRepositoryMock.mockImplementation(() => new Promise(() => {}))
    const { createWorktreeSession } = await import("./worktreeSessionCreator")

    const first = createWorktreeSession()
    // A short real timer, not a resolved promise: the point is whether the second call settles while the first is
    // still waiting on the repository check, and an already-resolved promise would win the race either way.
    const outcome = await Promise.race([
      createWorktreeSession().then((value) => `settled:${String(value)}`),
      new Promise((resolve) => setTimeout(() => resolve("still-running"), 50)),
    ])

    expect(outcome).toBe("settled:null")
    // Only the first call reached the repository check.
    expect(checkIsGitRepositoryMock).toHaveBeenCalledTimes(1)
    void first
  })
})
