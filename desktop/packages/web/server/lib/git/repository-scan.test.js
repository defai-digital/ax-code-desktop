import { describe, expect, it } from "vitest"
import fsPromises from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { findGitRoot, inspectGitRepositories, listChildRepositories } from "./repository-scan.js"

const makeTree = async () => {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-git-scan-"))
  const code = path.join(root, "code")
  await fsPromises.mkdir(path.join(code, "app", ".git"), { recursive: true })
  await fsPromises.mkdir(path.join(code, "app", "packages", "web"), { recursive: true })
  await fsPromises.mkdir(path.join(code, "lib", ".git"), { recursive: true })
  await fsPromises.mkdir(path.join(code, "worktree"), { recursive: true })
  await fsPromises.writeFile(path.join(code, "worktree", ".git"), "gitdir: /elsewhere\n")
  await fsPromises.mkdir(path.join(code, "notes"), { recursive: true })
  await fsPromises.mkdir(path.join(code, ".hidden", ".git"), { recursive: true })
  return { root, code }
}

describe("git repository detection", () => {
  it("lists direct child repositories of a parent folder, including worktrees, skipping hidden folders", async () => {
    const { code } = await makeTree()
    const repos = await listChildRepositories({ directory: code, fsPromises, path })
    expect(repos.map((repo) => repo.name)).toEqual(["app", "lib", "worktree"])
  })

  it("resolves a subfolder to its repository root", async () => {
    const { root, code } = await makeTree()
    const gitRoot = await findGitRoot({
      directory: path.join(code, "app", "packages", "web"),
      ceiling: root,
      fsPromises,
      path,
    })
    expect(gitRoot).toBe(path.join(code, "app"))
  })

  it("reports no repository for a plain parent folder and never walks above the ceiling", async () => {
    const { code } = await makeTree()
    const result = await inspectGitRepositories({ directory: code, ceiling: code, fsPromises, path })
    expect(result.gitRoot).toBeNull()
    expect(result.childRepositories).toHaveLength(3)
    // A repository above the ceiling is not reported.
    const { root } = await makeTree()
    await fsPromises.mkdir(path.join(root, ".git"))
    expect(
      await findGitRoot({ directory: path.join(root, "code"), ceiling: path.join(root, "code"), fsPromises, path }),
    ).toBeNull()
  })
})
