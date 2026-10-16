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
