import { beforeEach, describe, expect, test, vi } from "vitest"

const { getScopedApiClient, scheduledTask } = vi.hoisted(() => ({
  getScopedApiClient: vi.fn(),
  scheduledTask: {
    list: vi.fn(),
    listRuns: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    delete: vi.fn(),
    runNow: vi.fn(),
  },
}))

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: { getScopedApiClient },
}))

import {
  createScheduledTasks,
  deleteScheduledTask,
  deleteScheduledTasks,
  expandPromptSnippets,
  fetchScheduledTasks,
  reconcileScheduledTaskFamily,
  runScheduledTaskNow,
  setScheduledTaskEnabled,
  setScheduledTasksEnabled,
  updateScheduledTask,
} from "./scheduledTasksApi"
import type { RuntimeTaskPayload } from "./scheduledTaskTransform"

const runtimeTask = (overrides: Record<string, unknown> = {}) => ({
  id: "st_1",
  projectID: "prj_1",
  directory: "/work/alpha",
  title: "Digest",
  prompt: "Summarize",
  schedule: { type: "daily", time: "09:00", timezone: "UTC" },
  status: "active",
  model: { providerID: "openai", modelID: "gpt-5" },
  catchUpPolicy: "run_once",
  nextRunAt: 100,
  time: { created: 1 },
  ...overrides,
})

describe("scheduledTasksApi", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getScopedApiClient.mockReturnValue({ scheduledTask })
  })

  test("fetchScheduledTasks scopes by directory and enriches with the latest run", async () => {
    scheduledTask.list.mockResolvedValue({ data: [runtimeTask()] })
    scheduledTask.listRuns.mockResolvedValue({
      data: [{ status: "failed", error: "model exploded", time: { created: 5 } }],
    })

    const tasks = await fetchScheduledTasks("/work/alpha")

    expect(getScopedApiClient).toHaveBeenCalledWith("/work/alpha")
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      id: "st_1",
      title: "Digest",
      status: "active",
      lastRunStatus: "error",
      lastError: "model exploded",
      nextRunAt: 100,
    })
  })

  test("fetchScheduledTasks degrades gracefully when run history fails", async () => {
    scheduledTask.list.mockResolvedValue({ data: [runtimeTask({ lastRunAt: 42 })] })
    scheduledTask.listRuns.mockRejectedValue(new Error("boom"))

    const tasks = await fetchScheduledTasks("/work/alpha")
    expect(tasks[0].lastRunStatus).toBe("success")
    expect(tasks[0].lastRunAt).toBe(42)
  })

  test("fetchScheduledTasks throws a readable error on list failure", async () => {
    scheduledTask.list.mockResolvedValue({ error: { message: "instance down" } })
    await expect(fetchScheduledTasks("/work/alpha")).rejects.toThrow("instance down")
  })

  test("fetchScheduledTasks requires a directory", async () => {
    await expect(fetchScheduledTasks(" ")).rejects.toThrow("directory is required")
  })

  test("createScheduledTasks creates each payload and pauses when requested", async () => {
    scheduledTask.create
      .mockResolvedValueOnce({ data: runtimeTask({ id: "st_a" }) })
      .mockResolvedValueOnce({ data: runtimeTask({ id: "st_b" }) })
    scheduledTask.pause.mockResolvedValue({ data: runtimeTask({ status: "paused" }) })

    await createScheduledTasks(
      "/work/alpha",
      [
        { title: "A", prompt: "p", schedule: { type: "daily", time: "09:00" }, catchUpPolicy: "run_once" },
        { title: "B", prompt: "p", schedule: { type: "daily", time: "18:00" }, catchUpPolicy: "run_once" },
      ],
      { pause: true },
    )

    expect(scheduledTask.create).toHaveBeenCalledTimes(2)
    expect(scheduledTask.pause).toHaveBeenCalledTimes(2)
    expect(scheduledTask.pause).toHaveBeenCalledWith({ scheduledTaskID: "st_a" })
  })

  test("updateScheduledTask forwards the patch to the runtime update route", async () => {
    scheduledTask.update.mockResolvedValue({ data: runtimeTask() })
    await updateScheduledTask("/work/alpha", "st_1", { title: "New", status: "paused" })
    expect(scheduledTask.update).toHaveBeenCalledWith({ scheduledTaskID: "st_1", title: "New", status: "paused" })
  })

  test("setScheduledTaskEnabled maps to pause/resume", async () => {
    scheduledTask.pause.mockResolvedValue({ data: runtimeTask({ status: "paused" }) })
    scheduledTask.resume.mockResolvedValue({ data: runtimeTask() })
    await setScheduledTaskEnabled("/work/alpha", "st_1", false)
    await setScheduledTaskEnabled("/work/alpha", "st_1", true)
    expect(scheduledTask.pause).toHaveBeenCalledWith({ scheduledTaskID: "st_1" })
    expect(scheduledTask.resume).toHaveBeenCalledWith({ scheduledTaskID: "st_1" })
  })

  test("deleteScheduledTask and runScheduledTaskNow surface runtime errors", async () => {
    scheduledTask.delete.mockResolvedValue({ error: { message: "not found" } })
    await expect(deleteScheduledTask("/work/alpha", "st_1")).rejects.toThrow("not found")

    scheduledTask.runNow.mockResolvedValue({ error: { message: "already running" } })
    await expect(runScheduledTaskNow("/work/alpha", "st_1")).rejects.toThrow("already running")
  })

  test("expandPromptSnippets expands #references and falls back on failure", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "expanded text" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      await expect(expandPromptSnippets("/work/alpha", "do #thing")).resolves.toBe("expanded text")
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toContain("snippets/expand")
      expect(url).toContain("directory=%2Fwork%2Falpha")
      expect((init?.headers as Record<string, string>)["x-ax-code-directory"]).toBe("/work/alpha")
    } finally {
      vi.unstubAllGlobals()
    }

    // No snippet reference: no request at all.
    const unused = vi.fn()
    vi.stubGlobal("fetch", unused)
    try {
      await expect(expandPromptSnippets("/work/alpha", "plain prompt")).resolves.toBe("plain prompt")
      expect(unused).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }

    // Endpoint failure: raw prompt preserved.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    )
    try {
      await expect(expandPromptSnippets("/work/alpha", "do #thing")).resolves.toBe("do #thing")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  const payload = (title: string, time: string, extra: Partial<RuntimeTaskPayload> = {}): RuntimeTaskPayload => ({
    title,
    prompt: "Summarize",
    schedule: { type: "daily", time, timezone: "UTC" },
    catchUpPolicy: "run_once",
    ...extra,
  })

  test("reconcileScheduledTaskFamily updates, then creates paused parts, then deletes", async () => {
    const order: string[] = []
    scheduledTask.update.mockImplementation(async (args: { scheduledTaskID: string }) => {
      order.push(`update:${args.scheduledTaskID}`)
      return { data: runtimeTask() }
    })
    scheduledTask.create.mockImplementation(async (body: { title: string }) => {
      const id = order.some((entry) => entry.startsWith("create:")) ? "st_new_b" : "st_new_a"
      order.push(`create:${body.title}`)
      return { data: runtimeTask({ id }) }
    })
    scheduledTask.pause.mockImplementation(async (args: { scheduledTaskID: string }) => {
      order.push(`pause:${args.scheduledTaskID}`)
      return { data: runtimeTask({ status: "paused" }) }
    })
    scheduledTask.delete.mockImplementation(async (args: { scheduledTaskID: string }) => {
      order.push(`delete:${args.scheduledTaskID}`)
      return { data: true }
    })

    await reconcileScheduledTaskFamily("/work/alpha", {
      updates: [
        {
          id: "st_1",
          payload: payload("Digest (1/3)", "09:00", {
            agent: "build",
            model: { providerID: "openai", modelID: "gpt-5" },
          }),
          status: "paused",
        },
        {
          id: "st_2",
          payload: payload("Digest (2/3)", "18:00"),
        },
        {
          id: "st_3",
          payload: payload("Digest (3/3)", "12:00"),
          clearModel: true,
        },
      ],
      creates: [payload("Digest (4/4)", "07:00"), payload("Digest (5/5)", "21:00", { agent: "review" })],
      createStatus: "paused",
      deletes: ["st_old", "st_older"],
    })

    expect(getScopedApiClient).toHaveBeenCalledWith("/work/alpha")
    expect(scheduledTask.update).toHaveBeenNthCalledWith(1, {
      scheduledTaskID: "st_1",
      title: "Digest (1/3)",
      prompt: "Summarize",
      schedule: { type: "daily", time: "09:00", timezone: "UTC" },
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-5" },
      catchUpPolicy: "run_once",
      status: "paused",
    })
    expect(scheduledTask.update).toHaveBeenNthCalledWith(2, {
      scheduledTaskID: "st_2",
      title: "Digest (2/3)",
      prompt: "Summarize",
      schedule: { type: "daily", time: "18:00", timezone: "UTC" },
      catchUpPolicy: "run_once",
    })
    expect(scheduledTask.update).toHaveBeenNthCalledWith(3, {
      scheduledTaskID: "st_3",
      title: "Digest (3/3)",
      prompt: "Summarize",
      schedule: { type: "daily", time: "12:00", timezone: "UTC" },
      model: null,
      catchUpPolicy: "run_once",
    })
    expect(scheduledTask.create).toHaveBeenNthCalledWith(1, payload("Digest (4/4)", "07:00"))
    expect(scheduledTask.pause).toHaveBeenNthCalledWith(1, { scheduledTaskID: "st_new_a" })
    expect(scheduledTask.create).toHaveBeenNthCalledWith(2, payload("Digest (5/5)", "21:00", { agent: "review" }))
    expect(scheduledTask.pause).toHaveBeenNthCalledWith(2, { scheduledTaskID: "st_new_b" })
    expect(scheduledTask.delete).toHaveBeenNthCalledWith(1, { scheduledTaskID: "st_old" })
    expect(scheduledTask.delete).toHaveBeenNthCalledWith(2, { scheduledTaskID: "st_older" })
    expect(order).toEqual([
      "update:st_1",
      "update:st_2",
      "update:st_3",
      "create:Digest (4/4)",
      "pause:st_new_a",
      "create:Digest (5/5)",
      "pause:st_new_b",
      "delete:st_old",
      "delete:st_older",
    ])
  })

  test("reconcileScheduledTaskFamily leaves new parts active when createStatus is not paused", async () => {
    scheduledTask.update.mockResolvedValue({ data: runtimeTask() })
    scheduledTask.create.mockResolvedValue({ data: runtimeTask({ id: "st_new" }) })
    scheduledTask.delete.mockResolvedValue({ data: true })

    await reconcileScheduledTaskFamily("/work/alpha", {
      updates: [{ id: "st_1", payload: payload("Digest", "09:00"), status: "active" }],
      creates: [payload("Digest (2/2)", "18:00")],
      createStatus: "active",
      deletes: ["st_old"],
    })

    expect(scheduledTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledTaskID: "st_1", status: "active" }),
    )
    expect(scheduledTask.pause).not.toHaveBeenCalled()
    expect(scheduledTask.create.mock.invocationCallOrder[0]).toBeLessThan(
      scheduledTask.delete.mock.invocationCallOrder[0],
    )
    expect(scheduledTask.update.mock.invocationCallOrder[0]).toBeLessThan(
      scheduledTask.create.mock.invocationCallOrder[0],
    )
  })

  test("reconcileScheduledTaskFamily aborts on the first update error and throws the SDK message", async () => {
    scheduledTask.update
      .mockResolvedValueOnce({ data: runtimeTask() })
      .mockResolvedValueOnce({ error: { message: "schedule rejected" } })
    scheduledTask.create.mockResolvedValue({ data: runtimeTask({ id: "st_new" }) })
    scheduledTask.delete.mockResolvedValue({ data: true })

    await expect(
      reconcileScheduledTaskFamily("/work/alpha", {
        updates: [
          { id: "st_1", payload: payload("Digest (1/2)", "09:00") },
          { id: "st_2", payload: payload("Digest (2/2)", "18:00") },
        ],
        creates: [payload("Digest (3/3)", "12:00")],
        createStatus: "paused",
        deletes: ["st_old"],
      }),
    ).rejects.toThrow("schedule rejected")

    expect(scheduledTask.update).toHaveBeenCalledTimes(2)
    expect(scheduledTask.create).not.toHaveBeenCalled()
    expect(scheduledTask.pause).not.toHaveBeenCalled()
    expect(scheduledTask.delete).not.toHaveBeenCalled()
  })

  test("reconcileScheduledTaskFamily aborts when creating a part fails and does not delete", async () => {
    scheduledTask.update.mockResolvedValue({ data: runtimeTask() })
    scheduledTask.create.mockResolvedValue({ error: { message: "create failed" } })
    scheduledTask.delete.mockResolvedValue({ data: true })

    await expect(
      reconcileScheduledTaskFamily("/work/alpha", {
        updates: [{ id: "st_1", payload: payload("Digest", "09:00") }],
        creates: [payload("Digest (2/2)", "18:00"), payload("Digest (3/3)", "21:00")],
        createStatus: "active",
        deletes: ["st_old"],
      }),
    ).rejects.toThrow("create failed")

    expect(scheduledTask.create).toHaveBeenCalledTimes(1)
    expect(scheduledTask.delete).not.toHaveBeenCalled()
  })

  test("reconcileScheduledTaskFamily aborts when a delete fails", async () => {
    scheduledTask.update.mockResolvedValue({ data: runtimeTask() })
    scheduledTask.create.mockResolvedValue({ data: runtimeTask({ id: "st_new" }) })
    scheduledTask.delete
      .mockResolvedValueOnce({ error: { message: "not found" } })
      .mockResolvedValueOnce({ data: true })

    await expect(
      reconcileScheduledTaskFamily("/work/alpha", {
        updates: [],
        creates: [payload("Digest (2/2)", "18:00")],
        createStatus: "active",
        deletes: ["st_old", "st_older"],
      }),
    ).rejects.toThrow("not found")

    expect(scheduledTask.delete).toHaveBeenCalledTimes(1)
    expect(scheduledTask.delete).toHaveBeenCalledWith({ scheduledTaskID: "st_old" })
  })

  test("setScheduledTasksEnabled resumes or pauses each id in order and stops on the first error", async () => {
    scheduledTask.resume.mockResolvedValue({ data: runtimeTask() })
    await setScheduledTasksEnabled("/work/alpha", ["st_1", "st_2"], true)
    expect(scheduledTask.resume).toHaveBeenNthCalledWith(1, { scheduledTaskID: "st_1" })
    expect(scheduledTask.resume).toHaveBeenNthCalledWith(2, { scheduledTaskID: "st_2" })
    expect(scheduledTask.resume.mock.invocationCallOrder[0]).toBeLessThan(
      scheduledTask.resume.mock.invocationCallOrder[1],
    )

    scheduledTask.pause.mockResolvedValueOnce({ error: { message: "pause denied" } })
    await expect(setScheduledTasksEnabled("/work/alpha", ["st_a", "st_b"], false)).rejects.toThrow("pause denied")
    expect(scheduledTask.pause).toHaveBeenCalledTimes(1)
    expect(scheduledTask.pause).toHaveBeenCalledWith({ scheduledTaskID: "st_a" })
  })

  test("deleteScheduledTasks deletes each id in order and stops on the first error", async () => {
    scheduledTask.delete.mockResolvedValue({ data: true })
    await deleteScheduledTasks("/work/alpha", ["st_1", "st_2"])
    expect(scheduledTask.delete).toHaveBeenNthCalledWith(1, { scheduledTaskID: "st_1" })
    expect(scheduledTask.delete).toHaveBeenNthCalledWith(2, { scheduledTaskID: "st_2" })
    expect(scheduledTask.delete.mock.invocationCallOrder[0]).toBeLessThan(
      scheduledTask.delete.mock.invocationCallOrder[1],
    )

    scheduledTask.delete.mockReset()
    scheduledTask.delete.mockResolvedValueOnce({ error: { message: "still running" } })
    await expect(deleteScheduledTasks("/work/alpha", ["st_a", "st_b"])).rejects.toThrow("still running")
    expect(scheduledTask.delete).toHaveBeenCalledTimes(1)
    expect(scheduledTask.delete).toHaveBeenCalledWith({ scheduledTaskID: "st_a" })
  })
})
