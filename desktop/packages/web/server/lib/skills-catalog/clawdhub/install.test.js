import { beforeEach, describe, expect, test, vi } from "vitest"
import AdmZip from "adm-zip"
import fsPromises from "fs/promises"
import os from "os"
import path from "path"

vi.mock("./api.js", () => ({
  downloadClawdHubSkill: vi.fn(),
  fetchClawdHubSkillInfo: vi.fn(),
}))

const { downloadClawdHubSkill } = await import("./api.js")
const { installSkillsFromClawdHub, validateClawdHubZipEntries } = await import("./install.js")

const zipWithFiles = (files) => {
  const zip = new AdmZip()
  for (const [entryName, content] of Object.entries(files)) {
    zip.addFile(entryName, Buffer.from(content))
  }
  return zip.toBuffer()
}

describe("ClawdHub skill installation", () => {
  beforeEach(() => {
    downloadClawdHubSkill.mockReset()
  })

  test("skips downloaded skills with non-English catalog metadata", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "clawdhub-install-test-"))
    try {
      downloadClawdHubSkill.mockResolvedValueOnce(
        zipWithFiles({
          "SKILL.md": '---\nname: "Review Code | \\u4ee3\\u7801\\u5ba1\\u67e5"\ndescription: Review code.\n---\n',
        }),
      )

      const result = await installSkillsFromClawdHub({
        scope: "user",
        targetSource: "ax-code",
        userSkillDir: tempRoot,
        selections: [{ skillDir: "review-code", clawdhub: { slug: "review-code", version: "1.0.0" } }],
      })

      expect(result).toMatchObject({
        ok: true,
        installed: [],
        skipped: [{ skillName: "review-code", reason: "Skill catalog metadata must be English-only" }],
      })
      await expect(fsPromises.stat(path.join(tempRoot, "review-code"))).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test("keeps the installed skill when the replacement cannot be moved into place", async () => {
    // The overwrite deleted the installed copy before the rename, and a rename cannot land on a directory that
    // still exists — so a move that then failed (a cross-device copy out of space, a target that reappeared)
    // left the user with neither the old skill nor the new one, recorded only as "skipped".
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "clawdhub-install-test-"))
    const renameSpy = vi.spyOn(fsPromises, "rename")
    try {
      const installedDir = path.join(tempRoot, "review-code")
      await fsPromises.mkdir(installedDir, { recursive: true })
      await fsPromises.writeFile(path.join(installedDir, "SKILL.md"), "# Review Code\nold body\n")

      downloadClawdHubSkill.mockResolvedValueOnce(
        zipWithFiles({ "SKILL.md": '---\nname: "Review Code"\ndescription: Review code.\n---\nnew body\n' }),
      )
      const renameError = Object.assign(new Error("ENOTEMPTY: directory not empty"), { code: "ENOTEMPTY" })
      renameSpy.mockRejectedValue(renameError)

      const result = await installSkillsFromClawdHub({
        scope: "user",
        targetSource: "ax-code",
        userSkillDir: tempRoot,
        conflictDecisions: { "review-code": "overwrite" },
        selections: [{ skillDir: "review-code", clawdhub: { slug: "review-code", version: "1.0.0" } }],
      })

      expect(result.installed).toEqual([])
      expect(result.skipped.map((entry) => entry.skillName)).toEqual(["review-code"])
      await expect(fsPromises.readFile(path.join(installedDir, "SKILL.md"), "utf8")).resolves.toContain("old body")
    } finally {
      renameSpy.mockRestore()
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test("keeps the replaced copy when restoring it fails", async () => {
    // The restore's rejection was swallowed and the finally deleted the backup regardless: the user was left with
    // a half-written directory and no complete copy of the skill they had.
    const realCp = fsPromises.cp.bind(fsPromises)
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "clawdhub-install-test-"))
    const targetDir = path.join(tempRoot, "review-code")
    const backups = async () =>
      (await fsPromises.readdir(os.tmpdir())).filter((name) => name.startsWith("clawdhub-replaced-review-code-"))
    let renameSpy = null
    let cpSpy = null
    try {
      await fsPromises.mkdir(targetDir, { recursive: true })
      await fsPromises.writeFile(
        path.join(targetDir, "SKILL.md"),
        '---\nname: "Review Code"\ndescription: Review code.\n---\ninstalled\n',
        "utf8",
      )
      downloadClawdHubSkill.mockResolvedValueOnce(
        zipWithFiles({ "SKILL.md": '---\nname: "Review Code"\ndescription: Review code.\n---\nincoming\n' }),
      )
      const backupsBefore = (await backups()).length
      renameSpy = vi.spyOn(fsPromises, "rename").mockRejectedValue(Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" }))
      let cpCalls = 0
      cpSpy = vi.spyOn(fsPromises, "cp").mockImplementation(async (...args) => {
        cpCalls += 1
        if (cpCalls === 2) {
          throw new Error("ENOSPC: no space left on device")
        }
        return realCp(...args)
      })

      const result = await installSkillsFromClawdHub({
        scope: "user",
        targetSource: "ax-code",
        userSkillDir: tempRoot,
        conflictDecisions: { "review-code": "overwrite" },
        selections: [{ skillDir: "review-code", clawdhub: { slug: "review-code", version: "1.0.0" } }],
      })

      expect(result.installed).toEqual([])
      expect(result.skipped.map((entry) => entry.skillName)).toEqual(["review-code"])
      // The replaced copy is still on disk, which is the only complete one left.
      expect((await backups()).length).toBe(backupsBefore + 1)
    } finally {
      for (const name of await backups()) {
        await fsPromises.rm(path.join(os.tmpdir(), name), { recursive: true, force: true })
      }
      renameSpy?.mockRestore()
      cpSpy?.mockRestore()
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test("replaces the installed skill when the move succeeds", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "clawdhub-install-test-"))
    try {
      const installedDir = path.join(tempRoot, "review-code")
      await fsPromises.mkdir(installedDir, { recursive: true })
      await fsPromises.writeFile(path.join(installedDir, "SKILL.md"), "# Review Code\nold body\n")
      await fsPromises.writeFile(path.join(installedDir, "notes.txt"), "old note\n")

      downloadClawdHubSkill.mockResolvedValueOnce(
        zipWithFiles({ "SKILL.md": '---\nname: "Review Code"\ndescription: Review code.\n---\nnew body\n' }),
      )

      const result = await installSkillsFromClawdHub({
        scope: "user",
        targetSource: "ax-code",
        userSkillDir: tempRoot,
        conflictDecisions: { "review-code": "overwrite" },
        selections: [{ skillDir: "review-code", clawdhub: { slug: "review-code", version: "1.0.0" } }],
      })

      expect(result.installed.map((entry) => entry.skillName)).toEqual(["review-code"])
      await expect(fsPromises.readFile(path.join(installedDir, "SKILL.md"), "utf8")).resolves.toContain("new body")
      // Nothing of the replaced copy is left behind, and no backup directory stayed next to it.
      await expect(fsPromises.stat(path.join(installedDir, "notes.txt"))).rejects.toMatchObject({ code: "ENOENT" })
      expect((await fsPromises.readdir(tempRoot)).filter((entry) => entry !== "review-code")).toEqual([])
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test("keeps the installed skill when the overwrite download fails", async () => {
    // The installed copy used to be deleted before the download, so a network error or a yanked
    // version left the user with no skill at all while the result reported it as merely "skipped".
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "clawdhub-install-test-"))
    try {
      const installedDir = path.join(tempRoot, "review-code")
      await fsPromises.mkdir(installedDir, { recursive: true })
      await fsPromises.writeFile(path.join(installedDir, "SKILL.md"), "# Review Code\n")

      downloadClawdHubSkill.mockRejectedValueOnce(new Error("network down"))

      const result = await installSkillsFromClawdHub({
        scope: "user",
        targetSource: "ax-code",
        userSkillDir: tempRoot,
        conflictDecisions: { "review-code": "overwrite" },
        selections: [{ skillDir: "review-code", clawdhub: { slug: "review-code", version: "1.0.0" } }],
      })

      expect(result.installed).toEqual([])
      expect(result.skipped).toHaveLength(1)
      // The skill the user already had is still there.
      await expect(fsPromises.readFile(path.join(installedDir, "SKILL.md"), "utf8")).resolves.toContain("Review Code")
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test("rejects unsafe ZIP entry paths before extraction", () => {
    expect(
      validateClawdHubZipEntries({
        getEntries: () => [{ entryName: "SKILL.md" }, { entryName: "references/example.md" }],
      }),
    ).toEqual({ ok: true })

    expect(
      validateClawdHubZipEntries({
        getEntries: () => [{ entryName: "SKILL.md" }, { entryName: "..\\outside.txt" }],
      }),
    ).toEqual({ ok: false, reason: "Invalid ZIP entry path: ..\\outside.txt" })
  })

  test("rejects a symbolic-link entry before extraction", () => {
    // The path string is fine, so the name check passes and AdmZip creates a real link in the skill
    // directory — pointing wherever the archive says. The Unix mode lives in the high 16 bits of the
    // entry's external attributes.
    const symlinkEntry = { entryName: "SKILL.md", attr: (0o120777 << 16) >>> 0 }
    const regularEntry = { entryName: "references/example.md", attr: (0o100644 << 16) >>> 0 }

    expect(validateClawdHubZipEntries({ getEntries: () => [regularEntry] })).toEqual({ ok: true })
    expect(validateClawdHubZipEntries({ getEntries: () => [regularEntry, symlinkEntry] })).toEqual({
      ok: false,
      reason: "Skill package contains a symbolic link: SKILL.md",
    })
  })

  test("rejects a real symlink entry written into a ZIP", () => {
    // Built with the library so the entry's central-directory record carries the mode the check reads.
    const zip = new AdmZip()
    zip.addFile("SKILL.md", Buffer.from("# Skill\n"))
    zip.addFile("escape", Buffer.from("../../.ssh/authorized_keys"))
    const entry = zip.getEntries().find((candidate) => candidate.entryName === "escape")
    entry.attr = (0o120777 << 16) >>> 0

    const reread = new AdmZip(zip.toBuffer())
    expect(validateClawdHubZipEntries(reread)).toEqual({
      ok: false,
      reason: "Skill package contains a symbolic link: escape",
    })
  })
})
