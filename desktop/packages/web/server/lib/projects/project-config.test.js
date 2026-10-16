import { describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises"
import {
  MAX_LAST_ERROR_LENGTH,
  MAX_TASK_NAME_LENGTH,
  MAX_TASK_PROMPT_LENGTH,
  createProjectConfigRuntime,
} from "./project-config.js"

const createRuntime = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oc-scheduled-project-config-"))
  const runtime = createProjectConfigRuntime({
    fsPromises: await import("fs/promises"),
    path,
    projectsDirPath: tempRoot,
    createTaskID: () => "task-fixed-id",
  })
  return {
    runtime,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true })
    },
  }
}

describe("project-config runtime", () => {
  it("creates and persists a scheduled task", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const result = await runtime.upsertScheduledTask("project-test", {
        name: "Nightly digest",
        enabled: true,
        schedule: {
          kind: "daily",
          time: "09:30",
          timezone: "UTC",
        },
        execution: {
          prompt: "Summarize repository changes",
          providerID: "openai",
          modelID: "gpt-4.1",
        },
      })

      expect(result.created).toBe(true)
      expect(result.task.id).toBe("task-fixed-id")
      const reloaded = await runtime.listScheduledTasks("project-test")
      expect(reloaded).toHaveLength(1)
      expect(reloaded[0].name).toBe("Nightly digest")
      expect(reloaded[0].schedule.timezone).toBe("UTC")
      expect(reloaded[0].schedule.times).toEqual(["09:30"])
      expect(reloaded[0].catchUpPolicy).toBe("run_once")
    } finally {
      await cleanup()
    }
  })

  it("refuses a task list an updater did not return as an array", async () => {
    // `writeScheduledTasksToDisk` deletes the key for an empty list, so the old `Array.isArray(resolved)
    // ? resolved : []` fallback answered a broken updater by erasing every scheduled task in the project
    // and logging nothing.
    const { runtime, cleanup } = await createRuntime()
    try {
      await runtime.upsertScheduledTask("project-test", {
        name: "Nightly digest",
        enabled: true,
        schedule: { kind: "daily", time: "09:30", timezone: "UTC" },
        execution: { prompt: "Summarize repository changes", providerID: "openai", modelID: "gpt-4.1" },
      })

      await expect(runtime.replaceScheduledTasks("project-test", async () => null)).rejects.toThrow(
        "expects an array of tasks",
      )
      await expect(runtime.replaceScheduledTasks("project-test", async () => undefined)).rejects.toThrow(
        "expects an array of tasks",
      )

      const reloaded = await runtime.listScheduledTasks("project-test")
      expect(reloaded).toHaveLength(1)
      expect(reloaded[0].name).toBe("Nightly digest")
    } finally {
      await cleanup()
    }
  })

  it("persists catch-up policy and active queue recovery state", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const created = await runtime.upsertScheduledTask("project-recovery", {
        name: "Recoverable task",
        enabled: true,
        catchUpPolicy: "skip",
        schedule: { kind: "daily", time: "09:00", timezone: "UTC" },
        execution: { prompt: "run", providerID: "openai", modelID: "gpt-4.1" },
      })
      await runtime.updateScheduledTaskState("project-recovery", created.task.id, {
        lastStatus: "running",
        lastSessionId: "ses_recovery",
        activeQueueItemId: "que_recovery",
        activeRunReason: "scheduled",
      })

      const [reloaded] = await runtime.listScheduledTasks("project-recovery")
      expect(reloaded.catchUpPolicy).toBe("skip")
      expect(reloaded.state).toMatchObject({
        lastStatus: "running",
        lastSessionId: "ses_recovery",
        activeQueueItemId: "que_recovery",
        activeRunReason: "scheduled",
      })
    } finally {
      await cleanup()
    }
  })

  it("deduplicates and sorts scheduled task times", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const result = await runtime.upsertScheduledTask("project-test", {
        name: "Multi-run digest",
        enabled: true,
        schedule: {
          kind: "daily",
          times: ["16:00", "09:30", "16:00"],
          time: "09:30",
          timezone: "UTC",
        },
        execution: {
          prompt: "Summarize repository changes",
          providerID: "openai",
          modelID: "gpt-4.1",
        },
      })

      expect(result.task.schedule.times).toEqual(["09:30", "16:00"])
    } finally {
      await cleanup()
    }
  })

  it("trims and clamps scheduled task string fields", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const result = await runtime.upsertScheduledTask("project-test", {
        name: ` ${"n".repeat(MAX_TASK_NAME_LENGTH + 8)} `,
        enabled: true,
        schedule: {
          kind: "daily",
          time: "09:30",
          timezone: "UTC",
        },
        execution: {
          prompt: ` ${"p".repeat(MAX_TASK_PROMPT_LENGTH + 8)} `,
          providerID: "openai",
          modelID: "gpt-4.1",
        },
        state: {
          lastError: ` ${"e".repeat(MAX_LAST_ERROR_LENGTH + 8)} `,
        },
      })

      expect(result.task.name).toBe("n".repeat(MAX_TASK_NAME_LENGTH))
      expect(result.task.execution.prompt).toBe("p".repeat(MAX_TASK_PROMPT_LENGTH))
      expect(result.task.state.lastError).toBe("e".repeat(MAX_LAST_ERROR_LENGTH))
    } finally {
      await cleanup()
    }
  })

  it("rejects invalid cron expressions", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      await expect(
        runtime.upsertScheduledTask("project-test", {
          name: "Invalid cron task",
          enabled: true,
          schedule: {
            kind: "cron",
            cron: "invalid cron",
            timezone: "UTC",
          },
          execution: {
            prompt: "Run checks",
            providerID: "openai",
            modelID: "gpt-4.1",
          },
        }),
      ).rejects.toThrow("schedule.cron is invalid")
    } finally {
      await cleanup()
    }
  })

  it("preserves unknown project config keys when writing scheduled tasks", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const projectID = "path_preserve"
      const filePath = path.join(runtime.resolveProjectConfigPath(projectID))
      await writeFile(
        filePath,
        JSON.stringify(
          {
            projectNotes: "hello notes",
            projectTodos: [{ id: "t1", text: "buy milk", completed: false, createdAt: 1 }],
            projectActions: [{ id: "a1", name: "Run", command: "bun run dev" }],
            projectActionsPrimaryId: "a1",
            "setup-worktree": ["bun install"],
            projectPlanFiles: [{ id: "p1", path: "/tmp/plans/p1.md", createdAt: 2 }],
            projectPath: "/tmp/demo",
          },
          null,
          2,
        ),
        "utf8",
      )

      await runtime.upsertScheduledTask(projectID, {
        name: "nightly",
        enabled: true,
        schedule: { kind: "daily", time: "09:00", timezone: "UTC" },
        execution: { prompt: "run", providerID: "openai", modelID: "gpt-4.1" },
      })

      const raw = JSON.parse(await readFile(filePath, "utf8"))
      expect(raw.projectNotes).toBe("hello notes")
      expect(raw.projectTodos).toEqual([{ id: "t1", text: "buy milk", completed: false, createdAt: 1 }])
      expect(raw.projectActions).toHaveLength(1)
      expect(raw.projectActionsPrimaryId).toBe("a1")
      expect(raw["setup-worktree"]).toEqual(["bun install"])
      expect(raw.projectPlanFiles).toEqual([{ id: "p1", path: "/tmp/plans/p1.md", createdAt: 2 }])
      expect(raw.projectPath).toBe("/tmp/demo")
      expect(raw.scheduledTasks).toHaveLength(1)
      expect(raw.version).toBe(1)
    } finally {
      await cleanup()
    }
  })

  it("preserves scheduled task state timestamps when listing tasks", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const projectID = "timestamp_preserve"
      const filePath = path.join(runtime.resolveProjectConfigPath(projectID))
      await writeFile(
        filePath,
        JSON.stringify(
          {
            scheduledTasks: [
              {
                id: "task-existing",
                name: "nightly",
                enabled: true,
                schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" },
                execution: { prompt: "run", providerID: "openai", modelID: "gpt-4.1" },
                state: { createdAt: 10, updatedAt: 20, lastStatus: "idle" },
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      )

      const first = await runtime.listScheduledTasks(projectID)
      const second = await runtime.listScheduledTasks(projectID)

      expect(first[0].state.createdAt).toBe(10)
      expect(first[0].state.updatedAt).toBe(20)
      expect(second[0].state.updatedAt).toBe(20)
    } finally {
      await cleanup()
    }
  })

  it("accepts one-time schedule with date and time", async () => {
    const { runtime, cleanup } = await createRuntime()
    try {
      const result = await runtime.upsertScheduledTask("project-test", {
        name: "One-time review",
        enabled: true,
        schedule: {
          kind: "once",
          date: "2026-04-20",
          time: "13:45",
          timezone: "Europe/Kyiv",
        },
        execution: {
          prompt: "Create a release summary",
          providerID: "openai",
          modelID: "gpt-4.1",
        },
      })

      expect(result.task.schedule.kind).toBe("once")
      expect(result.task.schedule.date).toBe("2026-04-20")
      expect(result.task.schedule.time).toBe("13:45")
      expect(result.task.schedule.timezone).toBe("Europe/Kyiv")
    } finally {
      await cleanup()
    }
  })
})

describe("project config file names", () => {
  it("keeps a long project id's config under a name the filesystem accepts", async () => {
    // A project id is `path_` + base64url of the whole project path, so a long path pushed the config
    // file name past the filesystem's 255-byte limit: the project's config could be neither written nor
    // read (ENAMETOOLONG), and the start command and scheduled tasks were lost with it.
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oc-long-project-id-"))
    const runtime = createProjectConfigRuntime({
      fsPromises: await import("fs/promises"),
      path,
      projectsDirPath: tempRoot,
      createTaskID: () => "task-fixed-id",
    })
    try {
      const longPath = `/${["deep-segment".repeat(4)].join("/").repeat(6)}`
      const projectID = `path_${Buffer.from(longPath, "utf8").toString("base64url")}`
      expect(projectID.length).toBeGreaterThan(255)

      await runtime.upsertScheduledTask(projectID, {
        name: "Nightly digest",
        enabled: true,
        schedule: { kind: "daily", time: "09:30", timezone: "UTC" },
        execution: { prompt: "Summarize repository changes", providerID: "openai", modelID: "gpt-4.1" },
      })

      const reloaded = await runtime.listScheduledTasks(projectID)
      expect(reloaded).toHaveLength(1)
      expect(reloaded[0].name).toBe("Nightly digest")

      const entries = await readdir(tempRoot)
      expect(entries).toHaveLength(1)
      expect(Buffer.byteLength(entries[0], "utf8")).toBeLessThan(255)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("still reads a config an earlier version wrote under the full id", async () => {
    // An id longer than the bound but still short enough for the filesystem: the bounded name is used for
    // new writes, and the file the earlier version wrote under the full id is still read.
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oc-legacy-project-id-"))
    const runtime = createProjectConfigRuntime({
      fsPromises: await import("fs/promises"),
      path,
      projectsDirPath: tempRoot,
      createTaskID: () => "task-fixed-id",
    })
    try {
      const longID = `path_${"b".repeat(180)}`
      const legacyPath = path.join(tempRoot, `${longID}.json`)
      await writeFile(
        legacyPath,
        JSON.stringify({
          version: 1,
          scheduledTasks: [
            {
              id: "task-legacy",
              name: "Legacy task",
              enabled: true,
              schedule: { kind: "daily", time: "09:30", timezone: "UTC" },
              execution: { prompt: "Summarize repository changes", providerID: "openai", modelID: "gpt-4.1" },
            },
          ],
        }),
        "utf8",
      )

      const tasks = await runtime.listScheduledTasks(longID)

      expect(tasks).toHaveLength(1)
      expect(tasks[0].name).toBe("Legacy task")
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
