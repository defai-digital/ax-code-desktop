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

  it("writes a referenced template file next to the config that references it", () => {
    // AX Code resolves `{file:...}` against the directory of the config file holding it. The update resolved it
    // against the user config directory instead, so the edit landed in a file AX Code never reads.
    const projectDir = fs.mkdtempSync(path.join(rootDir, "project-"))
    fs.mkdirSync(path.join(projectDir, "prompts"))
    fs.writeFileSync(path.join(projectDir, "prompts", "review.md"), "old template")
    fs.writeFileSync(
      path.join(projectDir, "ax-code.json"),
      JSON.stringify({ command: { review: { template: "{file:./prompts/review.md}" } } }),
    )

    commands.updateCommand("review", { template: "new template" }, projectDir)

    expect(fs.readFileSync(path.join(projectDir, "prompts", "review.md"), "utf8")).toBe("new template")
    expect(fs.existsSync(path.join(rootDir, "xdg", "ax-code", "prompts", "review.md"))).toBe(false)
  })

  it("refuses a template reference into the repository metadata", () => {
    const projectDir = fs.mkdtempSync(path.join(rootDir, "project-"))
    fs.mkdirSync(path.join(projectDir, ".git", "hooks"), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, "ax-code.json"),
      JSON.stringify({ command: { hook: { template: "{file:.git/hooks/pre-commit}" } } }),
    )

    expect(() => commands.updateCommand("hook", { template: "echo pwned" }, projectDir)).toThrow(
      "Invalid template file reference",
    )
    expect(fs.existsSync(path.join(projectDir, ".git", "hooks", "pre-commit"))).toBe(false)
  })
})
