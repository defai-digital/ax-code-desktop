import { afterEach, describe, expect, it, vi } from "vitest"
import os from "os"
import path from "path"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"

import { createProjectConfigRuntime } from "../projects/project-config.js"
import { createScheduledTaskConvergence } from "./convergence.js"

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} }

const createHarness = async ({ runtimeTasks = [], runtimeHandler } = {}) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oc-scheduled-convergence-"))
  const projectsDir = path.join(tempRoot, "projects")
  const markerPath = path.join(tempRoot, "scheduled-tasks-migrated.json")
  const projectConfigRuntime = createProjectConfigRuntime({
    fsPromises: await import("fs/promises"),
    path,
    projectsDirPath: projectsDir,
  })

  const requests = []
  const fetchImpl =
    runtimeHandler ||
    (async (url, init = {}) => {
      const method = init.method || "GET"
      requests.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined })
      if (method === "GET") {
        return new Response(JSON.stringify(runtimeTasks), { status: 200 })
      }
      if (method === "POST" && url.includes("/pause")) {
        return new Response(JSON.stringify({ id: "st_x", status: "paused" }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: `st_${requests.length}`, status: "active" }), { status: 200 })
    })

  const convergence = createScheduledTaskConvergence({
    fsPromises: await import("fs/promises"),
    path,
    projectsDirPath: projectsDir,
    markerPath,
    projectConfigRuntime,
    listProjects: async () => [{ id: "proj-a", path: "/work/alpha" }],
    buildAxCodeUrl: () => "http://127.0.0.1:4096/",
    getAxCodeAuthHeaders: () => ({ authorization: "Basic test" }),
    waitForAxCodeReady: async () => {},
    expandSnippets: (prompt) => prompt,
    logger: silentLogger,
    fetchImpl,
  })

  return {
    convergence,
    projectConfigRuntime,
    projectsDir,
    markerPath,
    requests,
    writeProject: async (fileName, data) => {
      await (await import("fs/promises")).mkdir(projectsDir, { recursive: true })
      await writeFile(path.join(projectsDir, fileName), JSON.stringify(data, null, 2), "utf8")
    },
    readProject: async (fileName) => JSON.parse(await readFile(path.join(projectsDir, fileName), "utf8")),
    readMarker: async () => JSON.parse(await readFile(markerPath, "utf8")),
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  }
}

const dailyTask = (overrides = {}) => ({
  id: "task-1",
  name: "Digest",
  enabled: true,
  catchUpPolicy: "run_once",
  schedule: { kind: "daily", times: ["09:00"], timezone: "UTC" },
  execution: { prompt: "Summarize", providerID: "openai", modelID: "gpt" },
  state: { createdAt: 1, updatedAt: 2 },
  ...overrides,
})

describe("scheduled task convergence migration", () => {
  let cleanup = async () => {}
  afterEach(async () => {
    await cleanup()
    cleanup = async () => {}
  })

  it("creates runtime tasks, clears the project JSON key, and writes the marker", async () => {
    const harness = await createHarness()
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [dailyTask()],
    })

    await harness.convergence.start()

    const creates = harness.requests.filter(
      (request) => request.method === "POST" && request.url.endsWith("/scheduled-task?directory=%2Fwork%2Falpha"),
    )
    expect(creates).toHaveLength(1)
    expect(creates[0].body.title).toBe("Digest")
    expect(creates[0].body.schedule).toEqual({ type: "daily", time: "09:00", timezone: "UTC" })

    const project = await harness.readProject("proj-a.json")
    expect(project.scheduledTasks).toBeUndefined()
    expect(project.projectPath).toBe("/work/alpha")

    const marker = await harness.readMarker()
    expect(typeof marker.migratedAt).toBe("number")
    expect(marker.skipped).toEqual([])
  })

  it("keeps a task saved while the migration was talking to the runtime", async () => {
    // The migration reads the project file, then spends seconds on per-task runtime calls, then wrote
    // back the list computed from that first read: a task the user saved in that window was silently
    // deleted by the write.
    let releaseFirstCreate = () => {}
    const firstCreateGate = new Promise((resolve) => {
      releaseFirstCreate = resolve
    })
    let createCalls = 0
    const harness = await createHarness({
      runtimeHandler: async (url, init = {}) => {
        const method = init.method || "GET"
        if (method === "GET") {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        createCalls += 1
        if (createCalls === 1) {
          await firstCreateGate
        }
        return new Response(JSON.stringify({ id: `st_${createCalls}`, status: "active" }), { status: 200 })
      },
    })
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [dailyTask()],
    })

    const migrating = harness.convergence.start()
    await vi.waitFor(async () => {
      expect(createCalls).toBe(1)
    })
    // The user saves a task while the first create is still in flight.
    await harness.projectConfigRuntime.upsertScheduledTask(
      "proj-a",
      dailyTask({ id: "task-saved", name: "Saved meanwhile" }),
    )
    releaseFirstCreate()
    await migrating

    const project = await harness.readProject("proj-a.json")
    expect((project.scheduledTasks ?? []).map((task) => task.id)).toEqual(["task-saved"])
  })

  it("fans out multi-time tasks and pauses disabled ones", async () => {
    const harness = await createHarness()
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [
        dailyTask({ name: "Multi", schedule: { kind: "daily", times: ["09:00", "18:00"], timezone: "UTC" } }),
        dailyTask({ id: "task-2", name: "Paused", enabled: false }),
      ],
    })

    await harness.convergence.start()

    const titles = harness.requests
      .filter((request) => request.method === "POST" && request.body?.title)
      .map((request) => request.body.title)
    expect(titles).toEqual(["Multi (1/2)", "Multi (2/2)", "Paused"])
    const pauses = harness.requests.filter((request) => request.url.includes("/pause"))
    expect(pauses).toHaveLength(1)

    const project = await harness.readProject("proj-a.json")
    expect(project.scheduledTasks).toBeUndefined()
  })

  it("is idempotent: titles already present in the runtime are not re-created", async () => {
    const harness = await createHarness({
      runtimeTasks: [{ id: "st_existing", title: "Digest", status: "active" }],
    })
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [dailyTask()],
    })

    await harness.convergence.start()

    const creates = harness.requests.filter((request) => request.method === "POST" && request.body?.title)
    expect(creates).toHaveLength(0)
    const project = await harness.readProject("proj-a.json")
    expect(project.scheduledTasks).toBeUndefined()
    const marker = await harness.readMarker()
    expect(typeof marker.migratedAt).toBe("number")
  })

  it("records permanent skips (unsupported cron, slash commands) and still finalizes", async () => {
    const harness = await createHarness()
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [
        dailyTask({ id: "task-cron", name: "Cron", schedule: { kind: "cron", cron: "0 9 * * MON", timezone: "UTC" } }),
        dailyTask({ id: "task-cmd", name: "Cmd", execution: { prompt: "/review", providerID: "o", modelID: "m" } }),
        dailyTask({ id: "task-ok", name: "Ok" }),
      ],
    })

    await harness.convergence.start()

    const marker = await harness.readMarker()
    expect(typeof marker.migratedAt).toBe("number")
    expect(marker.skipped).toHaveLength(2)
    expect(marker.skipped.map((entry) => entry.task).sort()).toEqual(["Cmd", "Cron"])
    const project = await harness.readProject("proj-a.json")
    expect(project.scheduledTasks).toBeUndefined()
  })

  it("keeps retryable tasks in the project JSON and writes a progress marker", async () => {
    let postCount = 0
    const harness = await createHarness({
      runtimeHandler: async (url, init = {}) => {
        const method = init.method || "GET"
        if (method === "GET") {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        postCount += 1
        return new Response("boom", { status: 500 })
      },
    })
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [dailyTask()],
    })

    await harness.convergence.start()
    expect(postCount).toBeGreaterThan(0)

    const project = await harness.readProject("proj-a.json")
    expect(project.scheduledTasks).toHaveLength(1)

    const marker = await harness.readMarker()
    expect(marker.migratedAt).toBeUndefined()
    expect(marker.attempts).toBe(1)
  })

  it("skips migration entirely once the marker is finalized, but still wakes directories", async () => {
    const harness = await createHarness()
    cleanup = harness.cleanup
    await harness.writeProject("proj-a.json", {
      projectPath: "/work/alpha",
      scheduledTasks: [dailyTask()],
    })
    await writeFile(
      harness.markerPath,
      JSON.stringify({ migratedAt: Date.now(), attempts: 1, skipped: [], warnings: [] }),
      "utf8",
    )

    await harness.convergence.start()

    // One GET for the wake-up, zero POSTs, and the project JSON is untouched.
    expect(harness.requests.filter((request) => request.method === "POST")).toHaveLength(0)
    expect(harness.requests.filter((request) => request.method === "GET")).toHaveLength(1)
    const project = await harness.readProject("proj-a.json")
    expect(project.scheduledTasks).toHaveLength(1)
  })

  it("does not touch the marker when the runtime is not ready", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oc-scheduled-convergence-notready-"))
    cleanup = () => rm(tempRoot, { recursive: true, force: true })
    const convergence = createScheduledTaskConvergence({
      fsPromises: await import("fs/promises"),
      path,
      projectsDirPath: path.join(tempRoot, "projects"),
      markerPath: path.join(tempRoot, "scheduled-tasks-migrated.json"),
      projectConfigRuntime: { replaceScheduledTasks: async () => ({ tasks: [] }) },
      listProjects: async () => [],
      buildAxCodeUrl: () => "http://127.0.0.1:4096/",
      getAxCodeAuthHeaders: () => ({}),
      waitForAxCodeReady: async () => {
        throw new Error("not ready")
      },
      expandSnippets: (prompt) => prompt,
      logger: silentLogger,
      fetchImpl: vi.fn(),
    })

    await convergence.start()
    await expect(readFile(path.join(tempRoot, "scheduled-tasks-migrated.json"), "utf8")).rejects.toThrow()
  })

  it("wakes every registered project directory once", async () => {
    const harness = await createHarness()
    cleanup = harness.cleanup
    await harness.convergence.wakeUp()
    const gets = harness.requests.filter((request) => request.method === "GET")
    expect(gets).toHaveLength(1)
    expect(gets[0].url).toContain("/scheduled-task")
    expect(gets[0].url).toContain("directory=%2Fwork%2Falpha")
  })
})

describe("scheduled task convergence wake watch", () => {
  const createWatchHarness = ({ projects, failDirectories = new Set(), hangDirectories = new Set() }) => {
    const woken = []
    const state = { projects }
    const convergence = createScheduledTaskConvergence({
      fsPromises: {},
      path,
      projectsDirPath: "/unused",
      markerPath: "/unused/marker.json",
      projectConfigRuntime: {},
      listProjects: async () => state.projects,
      buildAxCodeUrl: () => "http://127.0.0.1:4096/",
      getAxCodeAuthHeaders: () => ({}),
      waitForAxCodeReady: async () => {},
      expandSnippets: (prompt) => prompt,
      logger: silentLogger,
      wakeRequestTimeoutMs: 20,
      fetchImpl: async (url, init = {}) => {
        const directory = new URL(url).searchParams.get("directory")
        if (hangDirectories.has(directory)) {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal.reason))
          })
        }
        if (failDirectories.has(directory)) {
          return new Response("down", { status: 503 })
        }
        woken.push(directory)
        return new Response("[]", { status: 200 })
      },
    })
    return { convergence, woken, state }
  }

  let watch
  afterEach(() => {
    watch?.stop()
    watch = undefined
  })

  it("reads the project list only when a check is due", async () => {
    const { convergence, woken, state } = createWatchHarness({ projects: [{ path: "/p1" }] })
    let clock = 0
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: ["/p1"],
      checkMs: 60_000,
      projectsCheckMs: 30_000,
      now: () => clock,
    })
    state.projects = [{ path: "/p1" }, { path: "/p2" }]
    clock = 10_000
    await watch.check()
    expect(woken).toEqual([])
    clock = 31_000
    await watch.check()
    expect(woken).toEqual(["/p2"])
  })

  it("does nothing while the runtime identity and project set are unchanged", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }, { path: "/p2" }] })
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: ["/p1", "/p2"],
      checkMs: 60_000,
    })
    await watch.check()
    expect(woken).toEqual([])
  })

  it("re-wakes every project after the runtime restarts", async () => {
    const { convergence, woken } = createWatchHarness({
      projects: [{ path: "/p1" }, { path: "/p2" }, { path: "/p3" }],
    })
    let identity = "rt-1"
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => identity,
      initialDirectories: ["/p1", "/p2", "/p3"],
      checkMs: 60_000,
    })
    identity = null
    await watch.check()
    expect(woken).toEqual([])
    identity = "rt-2"
    await watch.check()
    expect([...woken].sort()).toEqual(["/p1", "/p2", "/p3"])
    await watch.check()
    expect(woken).toHaveLength(3)
  })

  it("wakes newly registered projects only", async () => {
    const { convergence, woken, state } = createWatchHarness({ projects: [{ path: "/p1" }] })
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: ["/p1"],
      checkMs: 60_000,
      projectsCheckMs: 0,
    })
    state.projects = [{ path: "/p1" }, { path: "/p2" }]
    await watch.check()
    expect(woken).toEqual(["/p2"])
  })

  it("retries directories whose wake request failed", async () => {
    const failDirectories = new Set(["/p2"])
    const { convergence, woken } = createWatchHarness({
      projects: [{ path: "/p1" }, { path: "/p2" }],
      failDirectories,
    })
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: ["/p1"],
      checkMs: 60_000,
      projectsCheckMs: 0,
    })
    await watch.check()
    expect(woken).toEqual([])
    failDirectories.clear()
    await watch.check()
    expect(woken).toEqual(["/p2"])
  })

  it("re-wakes everything when the refresh interval elapses", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }, { path: "/p2" }] })
    let clock = 1_000
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: ["/p1", "/p2"],
      checkMs: 60_000,
      refreshMs: 10_000,
      now: () => clock,
    })
    clock += 5_000
    await watch.check()
    expect(woken).toEqual([])
    clock += 6_000
    await watch.check()
    expect([...woken].sort()).toEqual(["/p1", "/p2"])
  })

  it("skips checks while inactive and after stop", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    let active = false
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      isActive: () => active,
      checkMs: 60_000,
    })
    await watch.check()
    expect(woken).toEqual([])
    active = true
    watch.stop()
    await watch.check()
    expect(woken).toEqual([])
  })

  it("replaces a previous watch when started again", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    const first = convergence.startWakeWatch({ getRuntimeIdentity: () => "rt-1", checkMs: 60_000 })
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: ["/p1"],
      checkMs: 60_000,
    })
    await first.check()
    await watch.check()
    expect(woken).toEqual([])
  })

  it("runs the slow refresh even while the runtime identity is unknown", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    let clock = 0
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => null,
      initialDirectories: ["/p1"],
      checkMs: 60_000,
      refreshMs: 10_000,
      now: () => clock,
    })
    clock = 5_000
    await watch.check()
    expect(woken).toEqual([])
    clock = 11_000
    await watch.check()
    expect(woken).toEqual(["/p1"])
  })

  it("wakes again shortly after a restart in case the first pass hit the old process", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    let clock = 0
    let identity = "rt-1"
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => identity,
      initialDirectories: ["/p1"],
      checkMs: 60_000,
      followUpMs: 20_000,
      now: () => clock,
    })
    identity = "rt-2"
    clock = 1_000
    await watch.check()
    expect(woken).toEqual(["/p1"])
    clock = 10_000
    await watch.check()
    expect(woken).toEqual(["/p1"])
    clock = 22_000
    await watch.check()
    expect(woken).toEqual(["/p1", "/p1"])
    clock = 50_000
    await watch.check()
    expect(woken).toEqual(["/p1", "/p1"])
  })

  it("does not adopt an identity that changed during the wake pass", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    let identity = "rt-1"
    let reads = 0
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => {
        reads += 1
        // The restart finishes while the first full wake is in flight.
        if (identity === "rt-2" && reads === 3) identity = "rt-3"
        return identity
      },
      initialDirectories: ["/p1"],
      checkMs: 60_000,
    })
    identity = "rt-2"
    await watch.check()
    expect(woken).toEqual(["/p1"])
    await watch.check()
    expect(woken).toEqual(["/p1", "/p1"])
  })

  it("forces a full wake when started with a null initial identity", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => "rt-1",
      initialDirectories: [],
      initialIdentity: null,
      checkMs: 60_000,
    })
    await watch.check()
    expect(woken).toEqual(["/p1"])
  })

  it("times out a wake request that never answers and keeps checking", async () => {
    const hangDirectories = new Set(["/p2"])
    const { convergence, woken } = createWatchHarness({
      projects: [{ path: "/p1" }, { path: "/p2" }],
      hangDirectories,
    })
    let identity = "rt-1"
    watch = convergence.startWakeWatch({
      getRuntimeIdentity: () => identity,
      initialDirectories: ["/p1", "/p2"],
      checkMs: 60_000,
      projectsCheckMs: 0,
    })
    identity = "rt-2"
    await watch.check()
    expect(woken).toEqual(["/p1"])
    hangDirectories.clear()
    await watch.check()
    expect(woken).toEqual(["/p1", "/p2"])
  })

  it("stopWakeWatch stops the active watch", async () => {
    const { convergence, woken } = createWatchHarness({ projects: [{ path: "/p1" }] })
    const active = convergence.startWakeWatch({ getRuntimeIdentity: () => "rt-1", checkMs: 60_000 })
    convergence.stopWakeWatch()
    await active.check()
    expect(woken).toEqual([])
  })
})
