import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createWebGitAPI } from "../../../src/api/git"
import { getStatus, getWorktrees, isGitRepository, stageFiles, unstageFiles } from "./service.js"
import { createSettingsNormalizationRuntime } from "../ax-code/settings-normalization-runtime.js"
import { createProjectIdFromPath } from "../projects/project-id.js"
import { normalizeProjectPath } from "../../../../../shared/path-values.mjs"

const roots = []
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

const init = async (directory) => {
  await fs.mkdir(directory)
  git(directory, ["init", "--quiet"])
  git(directory, ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "--quiet", "-m", "Fixture"])
}
const staged = (directory) => git(directory, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean)

describe.skipIf(process.platform === "win32")("literal POSIX directory and Git path contracts", () => {
  it.each(["repo ", "repo\\literal", "repo\nline", "repo\r"])("mutates only the selected repository %j and literal file", async (name) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ax-desktop-literal-"))
    roots.push(root)
    const plain = path.join(root, "repo")
    const target = path.join(root, name)
    await init(plain)
    await init(target)
    for (const directory of [plain, target]) {
      await Promise.all(["note.txt", "note.txt ", "  ", "back\\slash.txt", "[a].txt"].map((file) => fs.writeFile(path.join(directory, file), "fixture")))
    }
    expect(await isGitRepository(target)).toBe(true)
    expect((await getStatus(target)).worktreeRoot).toBe(await fs.realpath(target))
    expect((await getWorktrees(target)).map((entry) => entry.path)).toContain(await fs.realpath(target))
    const chosen = ["note.txt ", "  ", "back\\slash.txt", "[a].txt"]
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } })
    const requests = []
    vi.stubGlobal("fetch", async (input, init) => {
      const url = new URL(input)
      const directory = url.searchParams.get("directory")
      const { paths } = JSON.parse(init.body)
      requests.push({ directory, paths })
      if (url.pathname.endsWith("/unstage")) await unstageFiles(directory, paths)
      else await stageFiles(directory, paths)
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    })
    const api = createWebGitAPI()
    await api.stageGitFiles(target, chosen)
    expect(requests[0]).toEqual({ directory: target, paths: chosen })
    expect(staged(target).sort()).toEqual(chosen.sort())
    expect(staged(plain)).toEqual([])
    await expect(stageFiles(target, ["../outside"])).rejects.toThrow("outside repository")
    expect(staged(target).sort()).toEqual(chosen.sort())
    await api.unstageGitFiles(target, chosen)
    expect(staged(target)).toEqual([])
    expect(staged(plain)).toEqual([])
    expect(await fs.readFile(path.join(target, "note.txt"), "utf8")).toBe("fixture")
  }, 30_000)

  it("hydrates distinct real roots without changing ids, home expansion, or symlink deduplication", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ax-desktop-settings-path-"))
    roots.push(root)
    const plain = path.join(root, "repo")
    const spaced = path.join(root, "repo ")
    await fs.mkdir(plain)
    await fs.mkdir(spaced)
    await fs.symlink(plain, path.join(root, "alias"))
    const runtime = createSettingsNormalizationRuntime({ os: { homedir: () => root }, path, processLike: process, realpathSync: undefined })
    const projects = [plain, spaced].map((directory) => ({ id: createProjectIdFromPath(directory), path: directory }))
    expect(projects[0].id).not.toBe(projects[1].id)
    expect(runtime.sanitizeProjects(projects)).toEqual(projects)
    expect(runtime.normalizeDirectoryPath("~/repo ")).toBe(spaced)
    expect(runtime.normalizeDirectoryPath("   ")).toBe("")
    expect(normalizeProjectPath(spaced)).toBe(spaced)
    const realpathSync = (value) => value === path.join(root, "alias") ? plain : value
    const canonical = createSettingsNormalizationRuntime({ os, path, processLike: process, realpathSync })
    expect(canonical.sanitizeProjects([...projects, { id: "alias", path: path.join(root, "alias") }])).toEqual(projects)
  })
})
