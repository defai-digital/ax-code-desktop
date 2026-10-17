import fsPromises from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// The clone is replaced by a directory the test populates, so the install path can be exercised without a
// network: everything after `cloneRepo` reads the clone directory from disk.
vi.mock("./git.js", () => ({
  assertGitAvailable: vi.fn(async () => ({ ok: true })),
  cloneRepo: vi.fn(),
  looksLikeAuthError: () => false,
  runGit: vi.fn(async () => ({ ok: true, stdout: "", stderr: "" })),
}))

const { cloneRepo } = await import("./git.js")
const { installSkillsFromRepository } = await import("./install.js")

const skillMarkdown = (name, body) => `---\nname: "${name}"\ndescription: Install ${name}.\n---\n${body}\n`

const writeSkill = async (repoDir, relativeDir, name, body = "body") => {
  const dir = path.join(repoDir, relativeDir)
  await fsPromises.mkdir(dir, { recursive: true })
  await fsPromises.writeFile(path.join(dir, "SKILL.md"), skillMarkdown(name, body), "utf8")
  return dir
}

describe("git skill installation", () => {
  let tempRoot
  let cloneDir
  let userSkillDir

  beforeEach(async () => {
    tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skills-install-test-"))
    userSkillDir = path.join(tempRoot, "skills")
    await fsPromises.mkdir(userSkillDir, { recursive: true })
    cloneDir = path.join(tempRoot, "clone")
    await fsPromises.mkdir(cloneDir, { recursive: true })
    cloneRepo.mockReset()
    cloneRepo.mockImplementation(async ({ tempDir }) => {
      // The real clone fills the temp directory it is handed; this one copies the fixture tree into it.
      for (const entry of await fsPromises.readdir(cloneDir)) {
        await fsPromises.cp(path.join(cloneDir, entry), path.join(tempDir, entry), { recursive: true })
      }
      return { ok: true }
    })
  })

  afterEach(async () => {
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  })

  const install = (selections, extra = {}) =>
    installSkillsFromRepository({
      source: "owner/repo",
      scope: "user",
      targetSource: "ax-code",
      userSkillDir,
      selections: selections.map((skillDir) => ({ skillDir })),
      ...extra,
    })

  test("installs each selected directory into its own target", async () => {
    await writeSkill(cloneDir, "skills/review", "Review Code")
    await writeSkill(cloneDir, "skills/lint", "Lint Code")

    const result = await install(["skills/review", "skills/lint"])

    expect(result.installed.map((entry) => entry.skillName).sort()).toEqual(["lint", "review"])
    await expect(fsPromises.stat(path.join(userSkillDir, "review", "SKILL.md"))).resolves.toBeTruthy()
    await expect(fsPromises.stat(path.join(userSkillDir, "lint", "SKILL.md"))).resolves.toBeTruthy()
  })

  test("does not merge two selected directories that share a basename", async () => {
    // The target is chosen by basename, so `skills/review` and `extras/review` share one directory. Both were
    // copied into it (the second overwriting same-named files and leaving the first's own files behind) and both
    // were reported as installed: a directory holding files from neither skill.
    await writeSkill(cloneDir, "skills/review", "Review Code", "from skills")
    await fsPromises.writeFile(path.join(cloneDir, "skills", "review", "only-skills.txt"), "a", "utf8")
    await writeSkill(cloneDir, "extras/review", "Review Code", "from extras")
    await fsPromises.writeFile(path.join(cloneDir, "extras", "review", "only-extras.txt"), "b", "utf8")

    const result = await install(["skills/review", "extras/review"])

    expect(result.installed.map((entry) => entry.skillName)).toEqual(["review"])
    expect(result.skipped.map((entry) => entry.skillName)).toEqual(["review"])
    const targetFiles = await fsPromises.readdir(path.join(userSkillDir, "review"))
    expect(targetFiles.sort()).toEqual(["SKILL.md", "only-skills.txt"])
  })

  test("does not let an uninstallable directory hold the skill name", async () => {
    // The name was claimed when the directory was first seen, so a first `review` with no SKILL.md held it and a
    // second, installable `review` was skipped as a duplicate: neither landed.
    await fsPromises.mkdir(path.join(cloneDir, "skills/review"), { recursive: true })
    await writeSkill(cloneDir, "extras/review", "Review Code", "from extras")

    const result = await install(["skills/review", "extras/review"])

    expect(result.installed.map((entry) => entry.skillName)).toEqual(["review"])
    await expect(fsPromises.readFile(path.join(userSkillDir, "review", "SKILL.md"), "utf8")).resolves.toContain(
      "from extras",
    )
  })

  test("releases the skill name when the first directory cannot be installed", async () => {
    // The name was claimed before the copy, and a failed copy did not release it: a second directory with the same
    // basename — installable, in this case — was skipped as a duplicate and neither landed.
    const broken = await writeSkill(cloneDir, "skills/review", "Review Code", "from skills")
    await fsPromises.symlink(path.join(broken, "SKILL.md"), path.join(broken, "link.md"))
    await writeSkill(cloneDir, "extras/review", "Review Code", "from extras")

    const result = await install(["skills/review", "extras/review"])

    expect(result.installed.map((entry) => entry.skillName)).toEqual(["review"])
    await expect(fsPromises.readFile(path.join(userSkillDir, "review", "SKILL.md"), "utf8")).resolves.toContain(
      "from extras",
    )
  })

  test("keeps the installed skill when the replacement cannot be copied", async () => {
    // A source with a symlink fails `copyDirectoryNoSymlinks`. The overwrite deleted the installed copy first, so
    // the user was left with neither the old skill nor a new one, and the result only said "skipped".
    const targetDir = path.join(userSkillDir, "review")
    await fsPromises.mkdir(targetDir, { recursive: true })
    await fsPromises.writeFile(path.join(targetDir, "SKILL.md"), skillMarkdown("Review Code", "installed"), "utf8")

    const sourceDir = await writeSkill(cloneDir, "skills/review", "Review Code", "incoming")
    await fsPromises.symlink(path.join(sourceDir, "SKILL.md"), path.join(sourceDir, "link.md"))

    const result = await install(["skills/review"], { conflictDecisions: { review: "overwrite" } })

    expect(result.installed).toEqual([])
    expect(result.skipped.map((entry) => entry.skillName)).toEqual(["review"])
    await expect(fsPromises.readFile(path.join(targetDir, "SKILL.md"), "utf8")).resolves.toContain("installed")
  })

  test("refuses an unknown conflict decision instead of copying over the installed skill", async () => {
    // The decision was passed through unvalidated: any truthy string counted as consent at the conflict gate, and
    // the loop only had branches for "skip" and "overwrite" — so an unknown word fell through to the plain copy
    // with the installed directory still in place. Same-named files were replaced, stale ones were left, no backup
    // was kept and the response reported the skill as installed.
    const targetDir = path.join(userSkillDir, "review")
    await fsPromises.mkdir(targetDir, { recursive: true })
    await fsPromises.writeFile(path.join(targetDir, "SKILL.md"), skillMarkdown("Review Code", "installed"), "utf8")
    await fsPromises.writeFile(path.join(targetDir, "sentinel.txt"), "keep me", "utf8")
    await writeSkill(cloneDir, "skills/review", "Review Code", "incoming")

    const result = await install(["skills/review"], { conflictDecisions: { review: "banana" } })

    expect(result.ok).toBe(false)
    expect(result.error?.kind).toBe("conflicts")
    expect(result.error?.conflicts?.map((entry) => entry.skillName)).toEqual(["review"])
    // The installed copy is exactly as it was, and the clone was never even made.
    await expect(fsPromises.readFile(path.join(targetDir, "SKILL.md"), "utf8")).resolves.toContain("installed")
    await expect(fsPromises.readFile(path.join(targetDir, "sentinel.txt"), "utf8")).resolves.toBe("keep me")
    expect(cloneRepo).not.toHaveBeenCalled()
  })

  test("removes the backup directory when the backup copy itself fails", async () => {
    // The backup copy can fail on its own (no space, a permission it cannot read). The installed copy is
    // untouched in that case, so the partial backup is not the only copy of anything — but the `finally` keeps
    // the backup whenever the replacement did not land, so a `openchamber-skills-replaced-*` directory was left
    // in the temp directory on every such failure, with no record pointing at it.
    const targetDir = path.join(userSkillDir, "review")
    await fsPromises.mkdir(targetDir, { recursive: true })
    await fsPromises.writeFile(path.join(targetDir, "SKILL.md"), skillMarkdown("Review Code", "installed"), "utf8")
    await writeSkill(cloneDir, "skills/review", "Review Code", "incoming")

    const backupDirPrefix = "openchamber-skills-replaced-"
    const backupsBefore = (await fsPromises.readdir(os.tmpdir())).filter((entry) => entry.startsWith(backupDirPrefix))
    // Only the backup copy fails: the clone fixture copies through the same call.
    const realCp = fsPromises.cp
    const cpSpy = vi.spyOn(fsPromises, "cp").mockImplementation((source, destination, options) =>
      String(destination).includes(backupDirPrefix)
        ? Promise.reject(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }))
        : realCp(source, destination, options),
    )

    try {
      await expect(install(["skills/review"], { conflictDecisions: { review: "overwrite" } })).rejects.toThrow("ENOSPC")
    } finally {
      cpSpy.mockRestore()
    }

    expect((await fsPromises.readdir(os.tmpdir())).filter((entry) => entry.startsWith(backupDirPrefix))).toEqual(
      backupsBefore,
    )
    // The skill the user already had is untouched.
    await expect(fsPromises.readFile(path.join(targetDir, "SKILL.md"), "utf8")).resolves.toContain("installed")
  })

  test("replaces the installed skill when the copy succeeds", async () => {
    const targetDir = path.join(userSkillDir, "review")
    await fsPromises.mkdir(targetDir, { recursive: true })
    await fsPromises.writeFile(path.join(targetDir, "SKILL.md"), skillMarkdown("Review Code", "installed"), "utf8")
    await writeSkill(cloneDir, "skills/review", "Review Code", "incoming")

    const result = await install(["skills/review"], { conflictDecisions: { review: "overwrite" } })

    expect(result.installed.map((entry) => entry.skillName)).toEqual(["review"])
    await expect(fsPromises.readFile(path.join(targetDir, "SKILL.md"), "utf8")).resolves.toContain("incoming")
    // No backup directory is left next to the skill.
    expect((await fsPromises.readdir(userSkillDir)).sort()).toEqual(["review"])
  })
})
