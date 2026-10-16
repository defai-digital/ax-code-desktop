import { describe, expect, it } from "vitest"
import crypto from "crypto"
import fsPromises from "fs/promises"
import os from "os"
import path from "path"
import { createProjectIdFromPath } from "../projects/project-id.js"
import { createSettingsRuntime } from "./settings-runtime.js"

const createRuntime = async (overrides = {}) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-settings-runtime-"))
  const settingsFilePath = path.join(tempRoot, "settings.json")
  const runtime = createSettingsRuntime({
    fsPromises,
    path,
    crypto,
    SETTINGS_FILE_PATH: settingsFilePath,
    sanitizeProjects: (projects) => (Array.isArray(projects) ? projects : []),
    sanitizeSettingsUpdate: (settings) => settings,
    mergePersistedSettings: (_current, changes) => changes,
    normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
    normalizeStringArray: (values) =>
      Array.isArray(values) ? values.filter((value) => typeof value === "string") : [],
    formatSettingsResponse: (settings) => settings,
    resolveDirectoryCandidate: (value) => value,
    ...overrides,
  })

  return {
    runtime,
    settingsFilePath,
    tempRoot,
    cleanup: async () => {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    },
  }
}

describe("settings runtime", () => {
  it("purges disabled remote endpoints and stored credentials during migration", async () => {
    const { runtime, settingsFilePath, cleanup } = await createRuntime()
    try {
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify({
          themeId: "ax-dark",
          desktopHosts: [{ id: "remote-a", clientToken: "secret-token" }],
          desktopDefaultHostId: "remote-a",
          desktopLocalClientToken: "local-secret",
          desktopSshInstances: [{ id: "ssh-a", auth: { sshPassword: { value: "secret" } } }],
          desktopLanAccessEnabled: true,
          desktopUiPassword: "old-password",
          publicOrigin: "https://remote.example.com",
        }),
        "utf8",
      )

      const migrated = await runtime.readSettingsFromDiskMigrated()
      expect(migrated).toMatchObject({ themeId: "ax-dark" })
      expect(migrated).not.toHaveProperty("desktopHosts")
      expect(migrated).not.toHaveProperty("desktopDefaultHostId")
      expect(migrated).not.toHaveProperty("desktopLocalClientToken")
      expect(migrated).not.toHaveProperty("desktopSshInstances")
      expect(migrated).not.toHaveProperty("desktopLanAccessEnabled")
      expect(migrated).not.toHaveProperty("desktopUiPassword")
      expect(migrated).not.toHaveProperty("publicOrigin")

      await expect(fsPromises.readFile(settingsFilePath, "utf8")).resolves.not.toContain("secret")
    } finally {
      await cleanup()
    }
  })

  it("only remaps project plan paths within the migrated storage directory", async () => {
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime()
    try {
      const projectPath = path.join(tempRoot, "project")
      const oldProjectId = "legacy-project-id"
      const newProjectId = createProjectIdFromPath(projectPath)
      const projectsRoot = path.join(path.dirname(settingsFilePath), "projects")
      const oldStorageDir = path.join(projectsRoot, oldProjectId)
      const newStorageDir = path.join(projectsRoot, newProjectId)
      const siblingStorageDir = `${oldStorageDir}-sibling`

      await fsPromises.mkdir(projectPath, { recursive: true })
      await fsPromises.mkdir(projectsRoot, { recursive: true })
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify(
          {
            projects: [{ id: oldProjectId, path: projectPath, addedAt: 1, lastOpenedAt: 1 }],
            activeProjectId: oldProjectId,
          },
          null,
          2,
        ),
        "utf8",
      )
      await fsPromises.writeFile(
        path.join(projectsRoot, `${oldProjectId}.json`),
        JSON.stringify(
          {
            "setup-worktree": [" pnpm install ", "", null, "pnpm install"],
            projectTodos: [
              { id: "shared", title: "old shared" },
              { id: "old", title: "old only" },
            ],
            projectPlanFiles: [
              { id: "inside", path: path.join(oldStorageDir, "plans", "inside.md") },
              { id: "sibling", path: path.join(siblingStorageDir, "plans", "outside.md") },
            ],
          },
          null,
          2,
        ),
        "utf8",
      )
      await fsPromises.writeFile(
        path.join(projectsRoot, `${newProjectId}.json`),
        JSON.stringify(
          {
            "setup-worktree": ["npm install", "pnpm install"],
            projectTodos: [
              { id: "new", title: "new only" },
              { id: "shared", title: "new shared" },
            ],
          },
          null,
          2,
        ),
        "utf8",
      )

      await runtime.readSettingsFromDiskMigrated()

      const migratedConfig = JSON.parse(
        await fsPromises.readFile(path.join(projectsRoot, `${newProjectId}.json`), "utf8"),
      )
      expect(migratedConfig["setup-worktree"]).toEqual(["pnpm install", "npm install"])
      expect(migratedConfig.projectTodos).toEqual([
        { id: "new", title: "new only" },
        { id: "shared", title: "new shared" },
        { id: "old", title: "old only" },
      ])
      expect(migratedConfig.projectPlanFiles).toEqual([
        { id: "inside", path: path.join(newStorageDir, "plans", "inside.md") },
        { id: "sibling", path: path.join(siblingStorageDir, "plans", "outside.md") },
      ])
    } finally {
      await cleanup()
    }
  })

  it("repoints a dangling active project id before migrating the deterministic ids", async () => {
    // Documents that `migrateSettingsFromLegacyLastDirectory` repairs an active id that names no project before
    // `migrateSettingsToDeterministicProjectIds` maps the ids, which is why that later migration's
    // `projectIdMap.get(currentActiveId) || currentActiveId` fallback cannot leave a dangling id behind.
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime()
    try {
      const projectPath = path.join(tempRoot, "project")
      await fsPromises.mkdir(projectPath, { recursive: true })
      const migratedId = createProjectIdFromPath(projectPath)
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify(
          {
            projects: [{ id: "legacy-project-id", path: projectPath, addedAt: 1, lastOpenedAt: 1 }],
            activeProjectId: "removed-project-id",
          },
          null,
          2,
        ),
        "utf8",
      )

      const settings = await runtime.readSettingsFromDiskMigrated()

      expect(settings.projects.map((project) => project.id)).toEqual([migratedId])
      expect(settings.activeProjectId).toBe(migratedId)
      const onDisk = JSON.parse(await fsPromises.readFile(settingsFilePath, "utf8"))
      expect(onDisk.activeProjectId).toBe(migratedId)
    } finally {
      await cleanup()
    }
  })

  it("keeps the destination file when a migrating rename fails", async () => {
    // `moveDirectoryContents` deleted the destination before renaming, so a rename that then failed left the
    // destination's previous content gone and the source file still in the old directory — while the merged
    // config already pointed at the new one.
    const failingFs = {
      ...fsPromises,
      rename: async (fromPath, toPath) => {
        if (String(toPath).endsWith("notes.md")) {
          const error = new Error("operation not permitted")
          error.code = "EACCES"
          throw error
        }
        return fsPromises.rename(fromPath, toPath)
      },
    }
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime({ fsPromises: failingFs })
    try {
      const projectPath = path.join(tempRoot, "project")
      const projectsRoot = path.join(path.dirname(settingsFilePath), "projects")
      const oldProjectId = "legacy-project-id"
      const newProjectId = createProjectIdFromPath(projectPath)
      await fsPromises.mkdir(projectPath, { recursive: true })
      await fsPromises.mkdir(path.join(projectsRoot, oldProjectId), { recursive: true })
      await fsPromises.mkdir(path.join(projectsRoot, newProjectId), { recursive: true })
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify({ projects: [{ id: oldProjectId, path: projectPath, addedAt: 1, lastOpenedAt: 1 }] }, null, 2),
        "utf8",
      )
      await fsPromises.writeFile(path.join(projectsRoot, oldProjectId, "notes.md"), "source", "utf8")
      await fsPromises.writeFile(path.join(projectsRoot, newProjectId, "notes.md"), "destination", "utf8")

      await runtime.readSettingsFromDiskMigrated().catch(() => {})

      await expect(fsPromises.readFile(path.join(projectsRoot, newProjectId, "notes.md"), "utf8")).resolves.toBe(
        "destination",
      )
      await expect(fsPromises.readFile(path.join(projectsRoot, oldProjectId, "notes.md"), "utf8")).resolves.toBe(
        "source",
      )
    } finally {
      await cleanup()
    }
  })

  it("overwrites an existing destination file when the migration moves storage", async () => {
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime()
    try {
      const projectPath = path.join(tempRoot, "project")
      const projectsRoot = path.join(path.dirname(settingsFilePath), "projects")
      const oldProjectId = "legacy-project-id"
      const newProjectId = createProjectIdFromPath(projectPath)
      await fsPromises.mkdir(projectPath, { recursive: true })
      await fsPromises.mkdir(path.join(projectsRoot, oldProjectId), { recursive: true })
      await fsPromises.mkdir(path.join(projectsRoot, newProjectId), { recursive: true })
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify({ projects: [{ id: oldProjectId, path: projectPath, addedAt: 1, lastOpenedAt: 1 }] }, null, 2),
        "utf8",
      )
      await fsPromises.writeFile(path.join(projectsRoot, oldProjectId, "notes.md"), "newer", "utf8")
      await fsPromises.writeFile(path.join(projectsRoot, newProjectId, "notes.md"), "older", "utf8")

      await runtime.readSettingsFromDiskMigrated()

      await expect(fsPromises.readFile(path.join(projectsRoot, newProjectId, "notes.md"), "utf8")).resolves.toBe("newer")
      await expect(fsPromises.access(path.join(projectsRoot, oldProjectId))).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await cleanup()
    }
  })

  it.skipIf(process.platform !== "win32")("falls back when Windows blocks atomic settings replacement", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-settings-runtime-"))
    const settingsFilePath = path.join(tempRoot, "settings.json")
    const wrappedFs = {
      ...fsPromises,
      rename: async () => {
        const error = new Error("operation not permitted")
        error.code = "EPERM"
        throw error
      },
    }
    const runtime = createSettingsRuntime({
      fsPromises: wrappedFs,
      path,
      crypto,
      SETTINGS_FILE_PATH: settingsFilePath,
      sanitizeProjects: (projects) => (Array.isArray(projects) ? projects : []),
      sanitizeSettingsUpdate: (settings) => settings,
      mergePersistedSettings: (_current, changes) => changes,
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: (values) =>
        Array.isArray(values) ? values.filter((value) => typeof value === "string") : [],
      formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: (value) => value,
    })

    try {
      await runtime.writeSettingsToDisk({ theme: "dark" })

      await expect(fsPromises.readFile(settingsFilePath, "utf8")).resolves.toBe(
        JSON.stringify({ theme: "dark" }, null, 2),
      )
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("trims legacy theme preferences while migrating light and dark theme ids", async () => {
    const { runtime, settingsFilePath, cleanup } = await createRuntime()
    try {
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify(
          {
            themeId: " automatosx-light ",
            themeVariant: " light ",
          },
          null,
          2,
        ),
        "utf8",
      )

      const settings = await runtime.readSettingsFromDiskMigrated()

      expect(settings).toMatchObject({
        lightThemeId: "automatosx-light",
        darkThemeId: "automatosx-dark",
      })
    } finally {
      await cleanup()
    }
  })

  it("routes settings writes through the configured writer instead of disk", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-settings-runtime-"))
    const settingsFilePath = path.join(tempRoot, "settings.json")
    const delegated = []
    const settingsWriter = {
      write: async (settings) => {
        delegated.push(settings)
      },
    }
    const runtime = createSettingsRuntime({
      fsPromises,
      path,
      crypto,
      SETTINGS_FILE_PATH: settingsFilePath,
      sanitizeProjects: (projects) => (Array.isArray(projects) ? projects : []),
      sanitizeSettingsUpdate: (settings) => settings,
      mergePersistedSettings: (_current, changes) => changes,
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: (values) =>
        Array.isArray(values) ? values.filter((value) => typeof value === "string") : [],
      formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: (value) => value,
      settingsWriter,
    })

    try {
      await runtime.persistSettings({ themeId: "ax-dark" })

      expect(delegated).toEqual([{ themeId: "ax-dark" }])
      // The web layer must not write settings.json itself when a writer is
      // configured (desktop mode: Electron main is the sole writer).
      await expect(fsPromises.access(settingsFilePath)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("keeps projects with temporarily-missing paths when persisting settings", async () => {
    const { runtime, tempRoot, cleanup } = await createRuntime()
    try {
      const existingPath = path.join(tempRoot, "existing-project")
      await fsPromises.mkdir(existingPath, { recursive: true })
      const missingPath = path.join(tempRoot, "missing-project")
      const projects = [
        { id: createProjectIdFromPath(existingPath), path: existingPath, addedAt: 1, lastOpenedAt: 1 },
        { id: createProjectIdFromPath(missingPath), path: missingPath, addedAt: 2, lastOpenedAt: 2 },
      ]

      const persisted = await runtime.persistSettings({ projects })

      expect(persisted.projects).toEqual(projects)
    } finally {
      await cleanup()
    }
  })

  it("does not write the credential-bearing keys to the log it strips before persisting", async () => {
    // persistSettings logged the raw request body first and stripped `desktopUiPassword`,
    // `desktopLocalClientToken` and the remote-access entries afterwards, so the password
    // landed verbatim in server stdout — which Electron main captures.
    const { runtime, cleanup } = await createRuntime()
    const logged = []
    const originalLog = console.log
    console.log = (...args) => {
      logged.push(args.map((value) => String(value)).join(" "))
    }

    try {
      await runtime.persistSettings({
        themeId: "ax-dark",
        desktopUiPassword: "hunter2-password",
        desktopLocalClientToken: "local-client-token-value",
      })
    } finally {
      console.log = originalLog
      await cleanup()
    }

    const output = logged.join("\n")
    expect(output).not.toContain("hunter2-password")
    expect(output).not.toContain("local-client-token-value")
    // The key still appears, so the log keeps saying what the request carried.
    expect(output).toContain("desktopUiPassword")
  })
})
