import { afterEach, describe, expect, test, vi } from "vitest"

const { checkIsGitRepositoryMock, getActiveProjectMock } = vi.hoisted(() => ({
  checkIsGitRepositoryMock: vi.fn(),
  getActiveProjectMock: vi.fn(),
}))

vi.mock("@/lib/gitApi", () => ({
  checkIsGitRepository: (...args: unknown[]) => checkIsGitRepositoryMock(...args),
  previewGitWorktree: vi.fn(),
}))

vi.mock("@/stores/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({ getActiveProject: (...args: unknown[]) => getActiveProjectMock(...args) }),
  },
}))

afterEach(() => {
  vi.resetModules()
  checkIsGitRepositoryMock.mockReset()
  getActiveProjectMock.mockReset()
})

describe("createWorktreeSession re-entrancy", () => {
  test("does not stay claimed when the project lookup throws", async () => {
    // The flag is module-level and has no other owner. Claiming it before the store call meant a throw from there
    // left every later attempt answering `null` from the guard — the feature was dead for the life of the
    // renderer — where the same throw before the claim costs only the attempt that failed.
    getActiveProjectMock.mockImplementationOnce(() => {
      throw new Error("the projects store is not loaded")
    })
    getActiveProjectMock.mockReturnValue({ id: "proj_1", path: "/repo" })
    checkIsGitRepositoryMock.mockImplementation(() => new Promise(() => {}))
    const { createWorktreeSession } = await import("./worktreeSessionCreator")

    await expect(createWorktreeSession()).rejects.toThrow("the projects store is not loaded")

    // The next attempt reaches the repository check rather than the guard.
    void createWorktreeSession()
    expect(checkIsGitRepositoryMock).toHaveBeenCalledTimes(1)
  })

  test("refuses a second press while the first is still checking the repository", async () => {
    // The guard was read at the top of the function and set after `await checkIsGitRepository`, and both the
    // keyboard shortcut and the menu item call this without awaiting: two presses in the same tick both passed it
    // and each went on to create a worktree and a branch, with one draft target between them. The second press is
    // now answered immediately.
    checkIsGitRepositoryMock.mockImplementation(() => new Promise(() => {}))
    getActiveProjectMock.mockReturnValue({ id: "proj_1", path: "/repo" })
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
