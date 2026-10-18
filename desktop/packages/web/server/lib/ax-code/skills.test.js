import { describe, expect, it } from "vitest"
import fsPromises from "fs/promises"
import os from "os"
import path from "path"
import {
  deleteSkill,
  getSkillScope,
  getSkillSources,
  mergeDiscoveredSkills,
  readSkillFilePathParam,
  readSkillNameParam,
  updateSkill,
} from "./skills.js"

describe("skills", () => {
  it("refuses a client-supplied targetPath outside the discovered skills", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    const outsideRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-outside-"))
    const skillName = "ax-coder-confinement-test-skill"
    const body = (text) => ["---", `name: ${skillName}`, "---", "", text, ""].join("\n")

    try {
      const insidePath = path.join(projectRoot, ".ax-code", "skills", skillName, "SKILL.md")
      const outsidePath = path.join(outsideRoot, "skills", skillName, "SKILL.md")
      for (const target of [insidePath, outsidePath]) {
        await fsPromises.mkdir(path.dirname(target), { recursive: true })
        await fsPromises.writeFile(target, body("Original."), "utf8")
      }

      // A path the server never discovered is rejected and left untouched.
      expect(() => updateSkill(skillName, { instructions: "Tampered." }, projectRoot, outsidePath)).toThrow(
        /outside the known skill directories/,
      )
      expect(await fsPromises.readFile(outsidePath, "utf8")).toContain("Original.")

      // The discovered in-project path remains editable through targetPath.
      updateSkill(skillName, { instructions: "Updated." }, projectRoot, insidePath)
      expect(await fsPromises.readFile(insidePath, "utf8")).toContain("Updated.")
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
      await fsPromises.rm(outsideRoot, { recursive: true, force: true })
    }
  })

  it("rebuilds a supporting-file path from the Express wildcard segments", () => {
    expect(readSkillFilePathParam(["references", "guide.md"])).toBe("references/guide.md")
    expect(readSkillFilePathParam(["references/guide.md"])).toBe("references/guide.md")
    expect(readSkillFilePathParam("guide.md")).toBe("guide.md")
    // Express 5 decodes each wildcard segment once; a literal percent in the file name must
    // survive as-is — decoding again turned `a%20b.md` into `a b.md` and 400'd on `100%.md`.
    expect(readSkillFilePathParam(["a%2Fb.md"])).toBe("a%2Fb.md")
    expect(readSkillFilePathParam(["100%.md"])).toBe("100%.md")
    expect(readSkillFilePathParam([])).toBeNull()
  })

  it("merges locally discovered skills missing from AX Code live discovery", () => {
    const merged = mergeDiscoveredSkills(
      [
        {
          name: "existing-ax-code-skill",
          path: "/home/jkker/.config/ax-code/skills/existing-ax-code-skill/SKILL.md",
          source: "ax-code",
        },
        {
          name: "existing-agent-skill",
          path: "/home/jkker/.agents/skills/existing-agent-skill/SKILL.md",
          source: "agents",
        },
      ],
      [
        {
          name: "existing-agent-skill",
          path: "/home/jkker/.agents/skills/existing-agent-skill/SKILL.md",
          source: "agents",
        },
        { name: "new-agent-skill", path: "/home/jkker/.agents/skills/new-agent-skill/SKILL.md", source: "agents" },
      ],
    )

    expect(merged.map((skill) => skill.name)).toEqual([
      "existing-ax-code-skill",
      "existing-agent-skill",
      "new-agent-skill",
    ])
  })

  it("uses trimmed skill names for discovery merge keys", () => {
    const primary = { name: " example-skill ", path: "/primary/SKILL.md", source: "ax-code" }
    const merged = mergeDiscoveredSkills(
      [primary, { name: "   ", path: "/blank/SKILL.md", source: "ax-code" }, { path: "/missing-name/SKILL.md" }],
      [{ name: "example-skill", path: "/fallback/SKILL.md", source: "agents" }],
    )

    expect(merged).toEqual([primary])
  })

  it("resolves built-in AX Code skill content without parsing virtual locations as files", () => {
    const sources = getSkillSources("customize-ax-code", "/tmp/openchamber-skills-test-missing-project", {
      name: "customize-ax-code",
      path: "<built-in>",
      scope: "user",
      source: "ax-code",
      description: "Customize ax-code",
      content: "# Customizing ax-code\n\nUse this skill when updating config.",
    })

    expect(sources.md.exists).toBe(true)
    expect(sources.md.path).toBe(null)
    expect(sources.md.dir).toBe(null)
    expect(sources.md.scope).toBe("user")
    expect(sources.md.source).toBe("ax-code")
    expect(sources.md.description).toBe("Customize ax-code")
    expect(sources.md.instructions).toBe("# Customizing ax-code\n\nUse this skill when updating config.")
    expect(sources.md.fields).toEqual(["description", "instructions"])
  })

  it("clears file metadata when a discovered skill path is unreadable", () => {
    const missingPath = path.join(os.tmpdir(), "openchamber-skills-test-missing-file", "SKILL.md")
    const sources = getSkillSources("missing-agent-skill", "/tmp/openchamber-skills-test-missing-project", {
      name: "missing-agent-skill",
      path: missingPath,
      scope: "user",
      source: "agents",
      description: "Missing skill",
    })

    expect(sources.md.exists).toBe(false)
    expect(sources.md.path).toBe(null)
    expect(sources.md.dir).toBe(null)
    expect(sources.md.scope).toBe(null)
    expect(sources.md.source).toBe(null)
    expect(sources.md.description).toBe("Missing skill")
    expect(sources.md.instructions).toBe("")
  })

  it("enriches discovered skills when their location is a real markdown file", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skills-"))
    const skillDir = path.join(tempRoot, "example-skill")
    const skillPath = path.join(skillDir, "SKILL.md")

    try {
      await fsPromises.mkdir(skillDir, { recursive: true })
      await fsPromises.writeFile(
        skillPath,
        [
          "---",
          "name: example-skill",
          "description: Example from agents",
          "---",
          "",
          "Use this skill for examples.",
          "",
        ].join("\n"),
        "utf8",
      )

      const sources = getSkillSources("example-skill", tempRoot, {
        name: "example-skill",
        path: skillPath,
        scope: "user",
        source: "agents",
        description: "Fallback description",
      })

      expect(sources.md.exists).toBe(true)
      expect(sources.md.path).toBe(skillPath)
      expect(sources.md.scope).toBe("user")
      expect(sources.md.source).toBe("agents")
      expect(sources.md.description).toBe("Example from agents")
      expect(sources.md.instructions).toBe("Use this skill for examples.")
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("resolves project agents skills even when discovery cannot infer a name", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-project-agents-skills-"))
    const skillDir = path.join(tempRoot, ".agents", "skills", "project-agent-skill")
    const skillPath = path.join(skillDir, "SKILL.md")

    try {
      await fsPromises.mkdir(skillDir, { recursive: true })
      await fsPromises.writeFile(
        skillPath,
        ["---", "description: Project agents fallback", "---", "", "Use this project agents skill.", ""].join("\n"),
        "utf8",
      )

      const sources = getSkillSources("project-agent-skill", tempRoot)

      expect(sources.projectAgentsMd?.exists).toBe(true)
      expect(sources.projectAgentsMd?.path).toBe(skillPath)
      expect(sources.md.exists).toBe(true)
      expect(sources.md.path).toBe(skillPath)
      expect(sources.md.scope).toBe("project")
      expect(sources.md.source).toBe("agents")
      expect(sources.md.description).toBe("Project agents fallback")
      expect(sources.md.instructions).toBe("Use this project agents skill.")

      expect(getSkillScope("project-agent-skill", tempRoot)).toEqual({
        scope: "project",
        path: skillPath,
        source: "agents",
      })
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

describe("skill name safety", () => {
  it("rejects traversal names without touching anything on disk", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    try {
      const skillDir = path.join(projectRoot, ".ax-code", "skills", "safe-skill")
      await fsPromises.mkdir(skillDir, { recursive: true })
      const markerPath = path.join(projectRoot, "do-not-delete.txt")
      await fsPromises.writeFile(markerPath, "keep", "utf8")

      // Express decodes %2F before the route sees the param, so
      // `DELETE /api/config/skills/..%2F..%2F.ax-code` arrives as "../../.ax-code".
      for (const badName of ["../../.ax-code", "..", "../..", "..\\..", "a/b", ""]) {
        expect(() => deleteSkill(badName, projectRoot)).toThrow(/Invalid Skill name|name is required/)
      }

      expect(await fsPromises.readFile(markerPath, "utf8")).toBe("keep")
      expect(await fsPromises.stat(skillDir)).toBeTruthy()
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("deletes only the named skill directories", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    try {
      const targetDir = path.join(projectRoot, ".ax-code", "skills", "oc-test-target-skill-9f8e7d")
      const siblingDir = path.join(projectRoot, ".ax-code", "skills", "oc-test-sibling-skill-9f8e7d")
      await fsPromises.mkdir(targetDir, { recursive: true })
      await fsPromises.mkdir(siblingDir, { recursive: true })

      deleteSkill("oc-test-target-skill-9f8e7d", projectRoot)

      await expect(fsPromises.stat(targetDir)).rejects.toThrow()
      expect(await fsPromises.stat(siblingDir)).toBeTruthy()
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("deletes only the requested source when a skill name exists in several places", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    const skillName = "oc-test-scoped-skill-4c1b2a"
    const axCodeDir = path.join(projectRoot, ".ax-code", "skills", skillName)
    const claudeDir = path.join(projectRoot, ".claude", "skills", skillName)
    try {
      for (const dir of [axCodeDir, claudeDir]) {
        await fsPromises.mkdir(dir, { recursive: true })
        await fsPromises.writeFile(
          path.join(dir, "SKILL.md"),
          ["---", `name: ${skillName}`, "description: Scoped", "---", "", "Body.", ""].join("\n"),
          "utf8",
        )
      }

      deleteSkill(skillName, projectRoot, { scope: "project", source: "claude" })

      await expect(fsPromises.stat(claudeDir)).rejects.toThrow()
      expect(await fsPromises.stat(axCodeDir)).toBeTruthy()
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("deletes a grouped skill resolved through discovery", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    const skillName = "oc-test-grouped-skill-7d3f0e"
    const groupedDir = path.join(projectRoot, ".ax-code", "skills", "testing-group", skillName)
    try {
      await fsPromises.mkdir(groupedDir, { recursive: true })
      await fsPromises.writeFile(
        path.join(groupedDir, "SKILL.md"),
        ["---", `name: ${skillName}`, "description: Grouped", "---", "", "Body.", ""].join("\n"),
        "utf8",
      )

      deleteSkill(skillName, projectRoot, { scope: "project", source: "ax-code" })

      await expect(fsPromises.stat(groupedDir)).rejects.toThrow()
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("never treats a SKILL.md at the skills root as its own directory", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    const skillsRoot = path.join(projectRoot, ".ax-code", "skills")
    const siblingDir = path.join(skillsRoot, "oc-test-sibling-skill-2a8c4f")
    try {
      await fsPromises.mkdir(siblingDir, { recursive: true })
      await fsPromises.writeFile(
        path.join(skillsRoot, "SKILL.md"),
        ["---", "name: oc-test-root-skill-2a8c4f", "description: Root", "---", "", "Body.", ""].join("\n"),
        "utf8",
      )
      await fsPromises.writeFile(
        path.join(siblingDir, "SKILL.md"),
        ["---", "name: oc-test-sibling-skill-2a8c4f", "description: Sibling", "---", "", "Body.", ""].join("\n"),
        "utf8",
      )

      // Discovery sees the root file as a skill whose directory is the whole
      // root; deleting it must not take the sibling (or the root) with it.
      expect(() => deleteSkill("oc-test-root-skill-2a8c4f", projectRoot)).toThrow(/not found/)
      expect(await fsPromises.stat(siblingDir)).toBeTruthy()
      expect(await fsPromises.stat(path.join(skillsRoot, "SKILL.md"))).toBeTruthy()
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("deletes a skill whose folder name differs from its frontmatter name", async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-project-"))
    const skillDir = path.join(projectRoot, ".ax-code", "skills", "review")
    try {
      await fsPromises.mkdir(skillDir, { recursive: true })
      // The catalog installer copies the folder as-is, so the folder
      // ("review") and the discovered name ("Review Code") legitimately differ.
      await fsPromises.writeFile(
        path.join(skillDir, "SKILL.md"),
        ["---", "name: Review Code", "description: Review helper", "---", "", "Body.", ""].join("\n"),
        "utf8",
      )

      deleteSkill("Review Code", projectRoot, { scope: "project", source: "ax-code" })

      await expect(fsPromises.stat(skillDir)).rejects.toThrow()
    } finally {
      await fsPromises.rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("validates route skill names the same way as agent and command names", () => {
    expect(readSkillNameParam("safe-skill")).toBe("safe-skill")
    expect(readSkillNameParam("my.skill_2")).toBe("my.skill_2")
    expect(readSkillNameParam("..")).toBeNull()
    expect(readSkillNameParam("../../.ssh")).toBeNull()
    expect(readSkillNameParam("a/b")).toBeNull()
    expect(readSkillNameParam("a\\b")).toBeNull()
    expect(readSkillNameParam("")).toBeNull()
    expect(readSkillNameParam(undefined)).toBeNull()
  })
})
