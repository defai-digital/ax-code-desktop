import fsPromises from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./git.js", () => ({
  assertGitAvailable: vi.fn(async () => ({ ok: true })),
  cloneRepo: vi.fn(),
  looksLikeAuthError: () => false,
  runGit: vi.fn(),
}))

const { cloneRepo, runGit } = await import("./git.js")
const { scanSkillsRepository } = await import("./scan.js")

const SKILL_MD = '---\nname: "Review Code"\ndescription: Review code.\n---\nbody\n'

describe("skills repository scan", () => {
  let tempRoot

  beforeEach(async () => {
    tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skills-scan-test-"))
    cloneRepo.mockReset()
    runGit.mockReset()
    cloneRepo.mockImplementation(async ({ tempDir }) => {
      // The fallback below reads SKILL.md blobs through `git show`, so the clone only has to exist.
      await fsPromises.mkdir(tempDir, { recursive: true })
      return { ok: true }
    })
  })

  afterEach(async () => {
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  })

  test("lists the skills under the subpath when the sparse checkout does not provide them", async () => {
    runGit.mockImplementation(async (args) => {
      if (args.includes("ls-tree")) {
        return { ok: true, stdout: "skills/review/SKILL.md\nskills/lint/SKILL.md\n", stderr: "" }
      }
      if (args.includes("show")) {
        return { ok: true, stdout: SKILL_MD, stderr: "" }
      }
      // Every sparse-checkout step fails, which sends the scan to the tree fallback.
      return { ok: false, stdout: "", stderr: "sparse-checkout is not supported here" }
    })

    const result = await scanSkillsRepository({ source: "owner/repo" })

    expect(result.ok).toBe(true)
    expect(result.items.map((item) => item.skillName).sort()).toEqual(["lint", "review"])
  })

  test("reports a failed tree listing instead of an empty scan", async () => {
    // `git ls-tree` exits 0 with no output for a subpath that does not exist, so a failure is a real one — a
    // missing ref, a timeout, or stdout past the runner's buffer. Reporting it as an empty scan cached "this
    // repository has no skills" for the whole TTL.
    runGit.mockImplementation(async (args) => {
      if (args.includes("ls-tree")) {
        return { ok: false, stdout: "", stderr: "fatal: stdout maxBuffer length exceeded" }
      }
      return { ok: false, stdout: "", stderr: "sparse-checkout is not supported here" }
    })

    const result = await scanSkillsRepository({ source: "owner/repo" })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain("maxBuffer")
  })
})
