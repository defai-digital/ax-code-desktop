import fs from "fs"
import fsPromises from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, it, vi } from "vitest"
import {
  ensureProjectAxCodeResourceDirs,
  ensureProjectConfigPath,
  getConfigPaths,
  getConfigEntitySources,
  getPrimaryUserConfigPath,
  getProjectConfigCandidates,
  getUserConfigPaths,
  readConfigFile,
  readSkillSupportingFile,
  resolveAxCodeConfigDir,
  resolveProjectAxCodeResourcePath,
  resolvePromptFilePath,
  writeSkillSupportingFile,
} from "./shared.js"

describe("shared ax-code resource paths", () => {
  it("returns each config candidate once", () => {
    const workingDirectory = path.join(os.tmpdir(), "openchamber-config-candidates")

    const projectCandidates = getProjectConfigCandidates(workingDirectory)
    expect(new Set(projectCandidates).size).toBe(projectCandidates.length)

    const userPaths = getConfigPaths(workingDirectory).userPaths
    expect(new Set(userPaths).size).toBe(userPaths.length)
  })

  it("supports active config directories without duplicating plugin path logic", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-config-paths-"))
    const customConfigPath = path.join(tempRoot, "custom", "ax-code.json")

    try {
      expect(resolveAxCodeConfigDir(customConfigPath)).toBe(path.dirname(customConfigPath))

      const userPaths = getUserConfigPaths(path.dirname(customConfigPath))
      expect(userPaths).toEqual([
        path.join(tempRoot, "custom", "config.json"),
        path.join(tempRoot, "custom", "ax-code.json"),
        path.join(tempRoot, "custom", "ax-code.jsonc"),
      ])
      expect(getPrimaryUserConfigPath(userPaths, userPaths[0])).toBe(userPaths[0])

      await fsPromises.mkdir(path.dirname(userPaths[1]), { recursive: true })
      await fsPromises.writeFile(userPaths[1], "{}", "utf8")
      expect(getPrimaryUserConfigPath(userPaths, userPaths[0])).toBe(userPaths[1])
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("creates the project config directory for writers", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-project-config-"))

    try {
      const configPath = ensureProjectConfigPath(tempRoot)

      expect(configPath).toBe(path.join(tempRoot, ".ax-code", "ax-code.json"))
      expect((await fsPromises.stat(path.dirname(configPath))).isDirectory()).toBe(true)
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("prefers legacy project resources only when the primary path is absent", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-resource-paths-"))
    const primaryPath = path.join(tempRoot, ".ax-code", "commands", "demo.md")
    const legacyPath = path.join(tempRoot, ".ax-code", "command", "demo.md")

    try {
      await fsPromises.mkdir(path.dirname(legacyPath), { recursive: true })
      await fsPromises.writeFile(legacyPath, "legacy", "utf8")

      expect(resolveProjectAxCodeResourcePath(tempRoot, ["commands", "demo.md"], ["command", "demo.md"])).toBe(
        legacyPath,
      )

      await fsPromises.mkdir(path.dirname(primaryPath), { recursive: true })
      await fsPromises.writeFile(primaryPath, "primary", "utf8")

      expect(resolveProjectAxCodeResourcePath(tempRoot, ["commands", "demo.md"], ["command", "demo.md"])).toBe(
        primaryPath,
      )
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("creates both primary and legacy project resource directories", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-resource-dirs-"))

    try {
      const primaryDir = ensureProjectAxCodeResourceDirs(tempRoot, "skills", "skill")

      expect(primaryDir).toBe(path.join(tempRoot, ".ax-code", "skills"))
      expect((await fsPromises.stat(primaryDir)).isDirectory()).toBe(true)
      expect((await fsPromises.stat(path.join(tempRoot, ".ax-code", "skill"))).isDirectory()).toBe(true)
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("reads config files without a preflight existence check", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-config-read-"))
    const configPath = path.join(tempRoot, "ax-code.json")

    try {
      await fsPromises.writeFile(configPath, JSON.stringify({ model: "test-model" }), "utf8")
      const existsSync = vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
        if (candidate === configPath) {
          throw new Error("readConfigFile should not call existsSync before reading")
        }
        return false
      })

      try {
        expect(readConfigFile(configPath)).toEqual({ model: "test-model" })
      } finally {
        existsSync.mockRestore()
      }
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("treats missing config files as empty config", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-config-missing-"))

    try {
      expect(readConfigFile(path.join(tempRoot, "missing.json"))).toEqual({})
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

describe("shared config entity sources", () => {
  it("summarizes markdown sources with project precedence", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-entity-md-"))
    const userPath = path.join(tempRoot, "user", "demo.md")
    const projectPath = path.join(tempRoot, ".ax-code", "commands", "demo.md")

    try {
      await fsPromises.mkdir(path.dirname(userPath), { recursive: true })
      await fsPromises.mkdir(path.dirname(projectPath), { recursive: true })
      await fsPromises.writeFile(userPath, "---\ndescription: User\n---\nUser body", "utf8")
      await fsPromises.writeFile(projectPath, "---\ndescription: Project\n---\nProject body", "utf8")

      const sources = getConfigEntitySources({
        workingDirectory: tempRoot,
        entityName: "demo",
        sectionKey: "command",
        bodyField: "template",
        scopes: { USER: "user", PROJECT: "project" },
        getProjectPath: (_workingDirectory, entityName) =>
          path.join(tempRoot, ".ax-code", "commands", `${entityName}.md`),
        getUserPath: (entityName) => path.join(tempRoot, "user", `${entityName}.md`),
      })

      expect(sources.md).toEqual({
        exists: true,
        path: projectPath,
        scope: "project",
        fields: ["description", "template"],
      })
      expect(sources.projectMd).toEqual({ exists: true, path: projectPath })
      expect(sources.userMd).toEqual({ exists: true, path: userPath })
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("summarizes project JSON sources when no markdown file exists", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-entity-json-"))
    const configPath = path.join(tempRoot, ".ax-code", "ax-code.json")

    try {
      await fsPromises.mkdir(path.dirname(configPath), { recursive: true })
      await fsPromises.writeFile(
        configPath,
        JSON.stringify({ command: { demo: { description: "Project JSON", template: "Run it" } } }),
        "utf8",
      )

      const sources = getConfigEntitySources({
        workingDirectory: tempRoot,
        entityName: "demo",
        sectionKey: "command",
        bodyField: "template",
        scopes: { USER: "user", PROJECT: "project" },
        getProjectPath: (_workingDirectory, entityName) =>
          path.join(tempRoot, ".ax-code", "commands", `${entityName}.md`),
        getUserPath: (entityName) => path.join(tempRoot, "user", `${entityName}.md`),
      })

      expect(sources.md.exists).toBe(false)
      expect(sources.json).toEqual({
        exists: true,
        path: configPath,
        scope: "project",
        fields: ["description", "template"],
      })
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

describe("skill supporting files", () => {
  const withSkillDir = async (run) => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-skill-files-"))
    try {
      const skillDir = path.join(tempRoot, ".ax-code", "skills", "demo")
      const outsideDir = path.join(tempRoot, "outside")
      await fsPromises.mkdir(skillDir, { recursive: true })
      await fsPromises.mkdir(outsideDir, { recursive: true })
      await fsPromises.writeFile(path.join(skillDir, "SKILL.md"), "# Demo\n", "utf8")
      await fsPromises.writeFile(path.join(outsideDir, "secret.txt"), "do not touch", "utf8")
      await run({ skillDir, outsideDir })
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  }

  it("refuses a supporting file a symlink points at", async () => {
    // `path.resolve` does not follow symlinks, so a link that a project ships inside its own skill directory passed
    // the containment check and the read and the write acted on whatever it pointed at — any file the user can
    // reach, which is not what "inside this skill" means.
    await withSkillDir(async ({ skillDir, outsideDir }) => {
      const secretPath = path.join(outsideDir, "secret.txt")
      fs.symlinkSync(secretPath, path.join(skillDir, "evil"))

      expect(() => readSkillSupportingFile(skillDir, "evil")).toThrow(/denied/)
      expect(() => writeSkillSupportingFile(skillDir, "evil", "overwritten")).toThrow(/denied/)
      expect(fs.readFileSync(secretPath, "utf8")).toBe("do not touch")
    })
  })

  it("refuses to create the file a link with no target points at", async () => {
    // A link whose target does not exist cannot be resolved, and the walk up from it treated the leaf as a file
    // about to be created: the write followed the link and created that file wherever it pointed.
    await withSkillDir(async ({ skillDir, outsideDir }) => {
      const missingTarget = path.join(outsideDir, "new.txt")
      fs.symlinkSync(missingTarget, path.join(skillDir, "evil"))

      expect(() => writeSkillSupportingFile(skillDir, "evil", "created")).toThrow(/denied/)
      expect(fs.existsSync(missingTarget)).toBe(false)
      // The link is also not something to hand back as a file's contents.
      expect(readSkillSupportingFile(skillDir, "evil")).toBeNull()
    })
  })

  it("still reads and writes a file inside the skill directory", async () => {
    await withSkillDir(async ({ skillDir }) => {
      writeSkillSupportingFile(skillDir, path.join("notes", "one.md"), "hello")

      expect(readSkillSupportingFile(skillDir, path.join("notes", "one.md"))).toBe("hello")
      expect(readSkillSupportingFile(skillDir, "missing.md")).toBeNull()
    })
  })

  it("treats a name that only starts with two dots as inside the skill directory", async () => {
    // `path.relative` answers "..notes.md" for a file of that name inside the skill, and a bare `startsWith("..")`
    // read that answer as a traversal: the file was listed by the skill browser and then refused on open, on save
    // and on delete. Only a real `..` component leaves the directory; a leading `.` is part of the name.
    await withSkillDir(async ({ skillDir }) => {
      writeSkillSupportingFile(skillDir, "..notes.md", "inside")

      expect(readSkillSupportingFile(skillDir, "..notes.md")).toBe("inside")
    })
  })

  it("keeps refusing a traversal out of the skill directory", async () => {
    await withSkillDir(async ({ skillDir }) => {
      expect(() => writeSkillSupportingFile(skillDir, "../outside.md", "escaped")).toThrow(/denied/)
      expect(() => readSkillSupportingFile(skillDir, "../outside.md")).toThrow(/denied/)
      expect(fs.existsSync(path.join(skillDir, "..", "outside.md"))).toBe(false)
    })
  })
})

describe("prompt file references", () => {
  it("accepts a prompt file whose name only starts with two dots", () => {
    // `path.relative` answers "..notes.md" for a file of that name in the config directory, and a bare
    // `startsWith("..")` read that answer as a traversal — so `{file:..notes.md}` was refused while
    // `{file:notes/..notes.md}` kept working. A leading dot is part of the name; only a real ".." component
    // (or an absolute answer) leaves the config directory.
    const plain = resolvePromptFilePath("{file:notes.md}")
    const dotted = resolvePromptFilePath("{file:..notes.md}")
    const nested = resolvePromptFilePath("{file:drafts/..notes.md}")

    expect(plain).not.toBeNull()
    expect(dotted).not.toBeNull()
    expect(path.dirname(dotted)).toBe(path.dirname(plain))
    expect(path.basename(dotted)).toBe("..notes.md")
    expect(nested).not.toBeNull()
    expect(path.basename(nested)).toBe("..notes.md")
  })

  it("keeps refusing a prompt file outside the config directory", () => {
    expect(resolvePromptFilePath("{file:../outside.md}")).toBeNull()
    expect(resolvePromptFilePath("{file:drafts/../../outside.md}")).toBeNull()
    expect(resolvePromptFilePath("{file:/etc/passwd}")).toBeNull()
    expect(resolvePromptFilePath("{file:~/authorized_keys}")).toBeNull()
    // A reference that resolves to the config directory itself is not a file to read or overwrite.
    expect(resolvePromptFilePath("{file:.}")).toBeNull()
  })

  it("refuses a prompt file a link points out of the config directory", async () => {
    // The reference was resolved lexically, so a link *inside* the config directory passed the containment check and
    // the write followed it: an agent or command update then overwrote whatever the link pointed at. The canonical
    // comparison is the one the skill-file guard uses.
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-prompt-files-"))
    const configHome = path.join(tempRoot, "config")
    const configDir = path.join(configHome, "ax-code")
    const outsideDir = path.join(tempRoot, "outside")
    const previousConfigHome = process.env.XDG_CONFIG_HOME
    try {
      await fsPromises.mkdir(configDir, { recursive: true })
      await fsPromises.mkdir(outsideDir, { recursive: true })
      const outsidePath = path.join(outsideDir, "secret.md")
      await fsPromises.writeFile(outsidePath, "do not touch", "utf8")
      fs.symlinkSync(outsidePath, path.join(configDir, "linked.md"))
      await fsPromises.writeFile(path.join(configDir, "notes.md"), "inside", "utf8")

      // The config directory is read once at module load, so the temp home needs a fresh instance. Restored in
      // `finally` so the other cases in this file keep using the real one.
      process.env.XDG_CONFIG_HOME = configHome
      vi.resetModules()
      const tempShared = await import("./shared.js")

      // A link out of the config directory is not a prompt file to read or overwrite.
      const linked = tempShared.resolvePromptFilePath("{file:linked.md}")
      expect(linked).toBeNull()
      if (linked) tempShared.writePromptFile(linked, "overwritten")
      expect(fs.readFileSync(outsidePath, "utf8")).toBe("do not touch")

      // A real file inside the config directory still resolves, and writing it works.
      const inside = tempShared.resolvePromptFilePath("{file:notes.md}")
      expect(inside).not.toBeNull()
      tempShared.writePromptFile(inside, "rewritten")
      expect(fs.readFileSync(path.join(configDir, "notes.md"), "utf8")).toBe("rewritten")

      // A new file is still a legitimate reference, and so is a name that only starts with two dots.
      const created = tempShared.resolvePromptFilePath("{file:new-notes.md}")
      expect(created).not.toBeNull()
      tempShared.writePromptFile(created, "created")
      expect(fs.readFileSync(path.join(configDir, "new-notes.md"), "utf8")).toBe("created")
      expect(tempShared.resolvePromptFilePath("{file:..notes.md}")).not.toBeNull()
    } finally {
      if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = previousConfigHome
      vi.resetModules()
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
})
