import fs from "fs"
import os from "os"
import path from "path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

let rootDir
let agents
let previousXdgConfigHome

describe("agent updates", () => {
  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-agents-"))
    // The user config directory is fixed when the module loads; keep it out of the real home.
    previousXdgConfigHome = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = path.join(rootDir, "xdg")
    vi.resetModules()
    agents = await import("./agents.js")
  })

  afterAll(() => {
    if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdgConfigHome
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it("updates a field carried by both the agent file and the JSON config where it is read back", () => {
    // The update wrote only the JSON copy, while the read prefers the `.md` frontmatter: the change was
    // reported saved and every later read still showed the old value.
    const projectDir = fs.mkdtempSync(path.join(rootDir, "project-"))
    fs.mkdirSync(path.join(projectDir, ".ax-code", "agents"), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, ".ax-code", "agents", "reviewer.md"),
      "---\nmodel: provider/old-model\n---\nReview the change.\n",
    )
    fs.writeFileSync(
      path.join(projectDir, "ax-code.json"),
      JSON.stringify({ agent: { reviewer: { model: "provider/old-model" } } }),
    )

    agents.updateAgent("reviewer", { model: "provider/new-model" }, projectDir)

    expect(agents.getAgentConfig("reviewer", projectDir).config.model).toBe("provider/new-model")
    const json = JSON.parse(fs.readFileSync(path.join(projectDir, "ax-code.json"), "utf8"))
    expect(json.agent.reviewer.model).toBe("provider/new-model")
  })
})
