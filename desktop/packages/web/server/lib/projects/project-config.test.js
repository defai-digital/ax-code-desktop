import { describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises"
import { createProjectConfigRuntime } from "./project-config.js"

const createRuntime = async (fsOverrides = {}) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oc-scheduled-project-config-"))
  const runtime = createProjectConfigRuntime({
    fsPromises: { ...(await import("fs/promises")), ...fsOverrides },
    path,
    projectsDirPath: tempRoot,
  })
  return {
    runtime,
    tempRoot,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true })
    },
  }
}

const storedTask = (overrides = {}) => ({
  id: "task-1",
  name: "Nightly digest",
  enabled: true,
  schedule: { kind: "daily", times: ["09:30"], timezone: "UTC" },
  execution: { prompt: "Summarize repository changes", providerID: "openai", modelID: "gpt-4.1" },
  ...overrides,
})

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"))

describe("project-config runtime", () => {
  it("refuses a task list an updater did not return as an array", async () => {
    // `writeScheduledTasksToDisk` deletes the key for an empty list, so the old `Array.isArray(resolved)
    // ? resolved : []` fallback answered a broken updater by erasing every scheduled task in the project
    // and logging nothing.
    const { runtime, cleanup } = await createRuntime()
    try {
      const filePath = runtime.resolveProjectConfigPath("project-test")
      await writeFile(filePath, JSON.stringify({ scheduledTasks: [storedTask()] }), "utf8")

      await expect(runtime.replaceScheduledTasks("project-test", async () => null)).rejects.toThrow(
        "expects an array of tasks",
      )
      await expect(runtime.replaceScheduledTasks("project-test", async () => undefined)).rejects.toThrow(
        "expects an array of tasks",
      )

      expect((await readJson(filePath)).scheduledTasks).toEqual([storedTask()])
    } finally {
      await cleanup()
    }
  })

  it("hands the updater the tasks exactly as stored, in stored order", async () => {
    // The migration matches the tasks it settled against this list by identity, so a task this version
    // could not normalize (an older schedule kind) or one stored without an id must reach it unchanged.
    const { runtime, cleanup } = await createRuntime()
    try {
      const filePath = runtime.resolveProjectConfigPath("project-raw")
      const tasks = [
        { id: "old", name: "old", schedule: { kind: "hourly" }, execution: { prompt: "p" } },
        { name: "no id", schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" } },
        storedTask(),
      ]
      await writeFile(filePath, JSON.stringify({ scheduledTasks: tasks }), "utf8")

      let seen
      await runtime.replaceScheduledTasks("project-raw", (current) => {
        seen = current
        return current.filter((task) => task.id !== "task-1")
      })

      expect(seen).toEqual(tasks)
      expect((await readJson(filePath)).scheduledTasks).toEqual(tasks.slice(0, 2))
    } finally {
      await cleanup()
    }
  })

  it("preserves unknown project config keys and removes the key once no task remains", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const projectID = "preserve_keys"
      const filePath = runtime.resolveProjectConfigPath(projectID)
      const otherKeys = {
        projectNotes: "hello notes",
        projectTodos: [{ id: "t1", text: "buy milk", completed: false, createdAt: 1 }],
        projectActions: [{ id: "a1", name: "Run", command: "bun run dev" }],
        projectActionsPrimaryId: "a1",
        "setup-worktree": ["bun install"],
        projectPath: "/tmp/demo",
      }
      await writeFile(filePath, JSON.stringify({ ...otherKeys, scheduledTasks: [storedTask()] }), "utf8")

      await runtime.replaceScheduledTasks(projectID, [])

      const raw = await readJson(filePath)
      expect(raw).toMatchObject({ ...otherKeys, version: 1, projectID })
      expect(raw.scheduledTasks).toBeUndefined()
    } finally {
      await cleanup()
    }
  })

  it("keeps a long project id's config under a name the filesystem accepts", async () => {
    // A project id is base64url of its whole path, so a long path made a config file name longer than the
    // filesystem's 255-byte limit: the project's config could be neither written nor read (ENAMETOOLONG).
    const { runtime, tempRoot, cleanup } = await createRuntime()
    try {
      const longPath = `/${["deep-segment".repeat(4)].join("/").repeat(6)}`
      const projectID = `path_${Buffer.from(longPath, "utf8").toString("base64url")}`
      expect(projectID.length).toBeGreaterThan(255)

      await runtime.replaceScheduledTasks(projectID, [storedTask()])

      const entries = await readdir(tempRoot)
      expect(entries).toHaveLength(1)
      expect(Buffer.byteLength(entries[0], "utf8")).toBeLessThan(255)
      expect(await readJson(path.join(tempRoot, entries[0]))).toMatchObject({
        projectID,
        scheduledTasks: [storedTask()],
      })
    } finally {
      await cleanup()
    }
  })

  it("reads a config an earlier version wrote under the full id, then replaces that file", async () => {
    // An id longer than the bound but still short enough for the filesystem: new writes use the bounded name,
    // the file the earlier version wrote under the full id is still read, and it is removed after the write so
    // a reader that enumerates the directory does not see the project twice.
    const { runtime, tempRoot, cleanup } = await createRuntime()
    try {
      const longID = `path_${"b".repeat(180)}`
      const legacyPath = path.join(tempRoot, `${longID}.json`)
      await writeFile(legacyPath, JSON.stringify({ version: 1, scheduledTasks: [storedTask()] }), "utf8")

      let seen
      await runtime.replaceScheduledTasks(longID, (current) => {
        seen = current
        return current
      })

      expect(seen).toEqual([storedTask()])
      const entries = await readdir(tempRoot)
      expect(entries).toHaveLength(1)
      expect(entries[0]).not.toBe(`${longID}.json`)
      expect(await readJson(path.join(tempRoot, entries[0]))).toMatchObject({ projectID: longID })
    } finally {
      await cleanup()
    }
  })

  it("removes its temporary file when the replace fails", async () => {
    // A replace that fails after the temporary copy was written (EXDEV, a locked target, EPERM on Windows).
    const { runtime, tempRoot, cleanup } = await createRuntime({
      rename: async () => {
        throw Object.assign(new Error("rename refused"), { code: "EPERM" })
      },
    })
    try {
      await expect(runtime.replaceScheduledTasks("project-blocked", [])).rejects.toThrow("rename refused")

      expect(await readdir(tempRoot)).toEqual([])
    } finally {
      await cleanup()
    }
  })
})
