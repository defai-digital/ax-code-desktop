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
    // Resolves so the attempt that follows settles: a pending one would leave the claim behind and the next test
    // in this file would start from it.
    checkIsGitRepositoryMock.mockResolvedValue(false)
    const { createWorktreeSession } = await import("./worktreeSessionCreator")

    await expect(createWorktreeSession()).rejects.toThrow("the projects store is not loaded")

    // The next attempt reaches the repository check rather than the guard.
    await expect(createWorktreeSession()).resolves.toBeNull()
    expect(checkIsGitRepositoryMock).toHaveBeenCalledTimes(1)
  })

  test("refuses a second press while the first is still checking the repository", async () => {
    // The guard was read at the top of the function and set after `await checkIsGitRepository`, and both the
    // keyboard shortcut and the menu item call this without awaiting: two presses in the same tick both passed it
    // and each went on to create a worktree and a branch, with one draft target between them. The second press is
    // now answered immediately.
    let releaseGitCheck = () => {}
    checkIsGitRepositoryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGitCheck = () => resolve(false)
        }),
    )
    getActiveProjectMock.mockReturnValue({ id: "proj_1", path: "/repo" })
    const { createWorktreeSession } = await import("./worktreeSessionCreator")

    const first = createWorktreeSession()
    const second = createWorktreeSession()

    // The second answered from the guard, without a second repository check.
    await expect(second).resolves.toBeNull()
    expect(checkIsGitRepositoryMock).toHaveBeenCalledTimes(1)

    // Let the first finish so the module's claim is released for whatever runs next.
    releaseGitCheck()
    await expect(first).resolves.toBeNull()
  })
})
