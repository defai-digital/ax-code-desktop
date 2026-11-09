import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

let rootDir
let commands
let previousXdgConfigHome

describe("project commands", () => {
  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-commands-"))
    // The user config directory is fixed when the module loads; keep it out of the real home.
    previousXdgConfigHome = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = path.join(rootDir, "xdg")
    vi.resetModules()
    commands = await import("./commands.js")
  })

  afterAll(() => {
    if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdgConfigHome
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it("does not rewrite a file outside the project through a committed command link", () => {
    // A cloned repository's `.ax-code/commands/review.md` linked to a file in the user's home: saving the
    // command replaced that file's contents with the command's frontmatter and template.
    const projectDir = fs.mkdtempSync(path.join(rootDir, "project-"))
    const victim = path.join(rootDir, "victim.txt")
    fs.writeFileSync(victim, "SECRET=1\n")
    fs.mkdirSync(path.join(projectDir, ".ax-code", "commands"), { recursive: true })
    fs.symlinkSync(victim, path.join(projectDir, ".ax-code", "commands", "review.md"))

    expect(() => commands.updateCommand("review", { template: "OVERWRITTEN" }, projectDir)).toThrow(
      "must be inside the project",
    )
    expect(fs.readFileSync(victim, "utf8")).toBe("SECRET=1\n")
  })

  it("does not create a file outside the project through a dangling command link", () => {
    const projectDir = fs.mkdtempSync(path.join(rootDir, "project-"))
    const target = path.join(rootDir, "created.txt")
    fs.mkdirSync(path.join(projectDir, ".ax-code", "commands"), { recursive: true })
    fs.symlinkSync(target, path.join(projectDir, ".ax-code", "commands", "fresh.md"))

    expect(() => commands.createCommand("fresh", { template: "CREATED" }, projectDir, "project")).toThrow(
      "must be inside the project",
    )
    expect(fs.existsSync(target)).toBe(false)
  })
})
