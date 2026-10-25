import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { EventEmitter } from "node:events"
import { runInNewContext } from "node:vm"
import { afterEach, describe, expect, test } from "vitest"
import { allocatePort } from "./launch.mjs"
import {
  E2E_APPROVE_PATTERN,
  E2E_DENY_PATTERN,
  E2E_FOREIGN_SESSION_ID,
  E2E_GOAL_OBJECTIVE,
  E2E_GOAL_UPDATED_OBJECTIVE,
  assertPathInsideDirectory,
  buildE2eScenario,
  findReplyAttemptProblems,
  isPathInsideDirectory,
  parseReplyLog,
} from "./scenario.mjs"
import { STUB_REPLIES_ENV, STUB_SCENARIO_ENV, buildStubRuntimeScript, writeStubRuntime } from "./stub-runtime.mjs"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Sandboxed shells may forbid listening sockets entirely (EPERM on bind);
// like the runtime integration tests that skip without a binary, the spawned
// stub tests then skip instead of failing for an environment reason. They
// run in full wherever loopback listening is allowed, CI included.
const canListen = await allocatePort()
  .then(() => true)
  .catch(() => false)
const spawnTest = canListen ? test : test.skip

const running = []

const startStub = async ({ scenario = null, originFile = "", repliesPath: repliesOverride = "" } = {}) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-e2e-stub-test-"))
  const stubPath = await writeStubRuntime(dir, { version: "9.9.9-test" })
  const repliesPath = repliesOverride || path.join(dir, "replies.jsonl")
  const env = { ...process.env }
  if (scenario) {
    const scenarioPath = path.join(dir, "scenario.json")
    await fs.writeFile(
      scenarioPath,
      JSON.stringify({ ...scenario, originFile: originFile || path.join(dir, "origin.txt") }),
    )
    env[STUB_SCENARIO_ENV] = scenarioPath
    env[STUB_REPLIES_ENV] = repliesPath
  }
  const port = await allocatePort()
  const child = spawn(process.execPath, [stubPath, "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const handle = { child, dir, repliesPath, base: `http://127.0.0.1:${port}` }
  running.push(handle)
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      const response = await fetch(`${handle.base}/global/health`)
      if (response.ok) return handle
    } catch {}
    if (Date.now() > deadline) throw new Error("The stub runtime did not become healthy")
    await sleep(50)
  }
}

afterEach(async () => {
  while (running.length) {
    const handle = running.pop()
    handle.child.kill("SIGTERM")
    await Promise.race([
      new Promise((resolve) => handle.child.once("exit", resolve)),
      sleep(3000).then(() => handle.child.kill("SIGKILL")),
    ])
    await fs.rm(handle.dir, { recursive: true, force: true }).catch(() => {})
  }
})

const readReplies = async (handle) => parseReplyLog(await fs.readFile(handle.repliesPath, "utf8").catch(() => ""))

spawnTest("Windows identity matching preserves directory spelling in path payloads and archive events", async () => {
  const directory = "C:/Users/RunnerAdmin/Project"
  const scenario = buildE2eScenario({ directory, portfolio: true })
  const handle = await startStub({ scenario })
  const response = await fetch(`${handle.base}/path?directory=${encodeURIComponent(directory)}`)
  expect((await response.json()).directory).toBe(directory)
  const controller = new AbortController()
  const stream = await fetch(`${handle.base}/global/event`, { signal: controller.signal })
  const reader = stream.body.getReader()
  try {
    await fetch(`${handle.base}/session/${scenario.session.id}?directory=${encodeURIComponent(directory)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ time: { archived: 123 } }),
    })
    const archives = await (await fetch(`${handle.base}/__e2e__/session-archives`)).json()
    expect(archives.writes[0].directory).toBe(directory)
    const decoder = new TextDecoder()
    let buffer = ""
    let update
    while (!update) {
      const { done, value } = await reader.read()
      if (done) throw new Error("Event stream ended before the archive update")
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split("\n\n")
      buffer = frames.pop()
      for (const frame of frames) {
        const data = frame.split("\n").find((line) => line.startsWith("data: "))
        if (!data) continue
        const event = JSON.parse(data.slice(6))
        if (event.payload?.type === "session.updated") update = event
      }
    }
    expect(update.directory).toBe(directory)
  } finally {
    controller.abort()
    await reader.cancel().catch(() => {})
  }
})

spawnTest("browser fixture accepts Windows path identity without changing POSIX case sensitivity", async () => {
  for (const [directory, requested, expected] of [
    ["C:\\Users\\RunnerAdmin\\Project", "c:/users/runneradmin/project", 200],
    ["/tmp/Project", "/tmp/project", 404],
  ]) {
    const scenario = buildE2eScenario({ directory, portfolio: true })
    const handle = await startStub({ scenario })
    const response = await fetch(`${handle.base}/desktop/browser/provider?directory=${encodeURIComponent(requested)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionID: scenario.session.id, snapshot: {} }),
    })
    expect(response.status).toBe(expected)
  }
})

spawnTest("portfolio fixture keeps same-name sessions and goals scoped to their own project", async () => {
  const scenario = buildE2eScenario({ directory: "/tmp/portfolio/project", portfolio: true })
  const other = scenario.portfolio[0]
  const handle = await startStub({ scenario })
  const read = async (route, directory) => {
    const url = new URL(route, handle.base)
    if (directory) url.searchParams.set("directory", directory)
    return fetch(url)
  }
  expect(await (await read("/experimental/session")).json()).toHaveLength(2)
  expect(await (await read("/session", other.session.directory)).json()).toEqual([other.session])
  expect(await (await read("/session", "/unknown")).json()).toEqual([])
  const createdResponse = await fetch(
    `${handle.base}/session?directory=${encodeURIComponent(other.session.directory)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Created browser session" }) },
  )
  const created = await createdResponse.json()
  expect(created).toMatchObject({
    id: "ses_e2e_created_1",
    title: "Created browser session",
    directory: other.session.directory,
  })
  expect(await (await read("/session", other.session.directory)).json()).toEqual([other.session, created])
  expect(await (await read(`/session/${created.id}`, other.session.directory)).json()).toEqual(created)
  expect(await (await read(`/session/${created.id}/message`, other.session.directory)).json()).toEqual([])
  const enrolled = await (await fetch(
    `${handle.base}/desktop/browser/provider?directory=${encodeURIComponent(other.session.directory)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionID: created.id, snapshot: {} }) },
  )).json()
  expect(enrolled).toMatchObject({ epoch: "e2e", projectID: scenario.project.id })
  expect(await (await read("/session/status", other.session.directory)).json()).toEqual({})
  expect((await read(`/session/${other.session.id}`, scenario.projectDirectory)).status).toBe(404)
  expect(await (await read(`/session/${other.session.id}`, other.session.directory)).json()).toEqual(other.session)
  expect(await (await read(`/session/${other.session.id}/message`, other.session.directory)).json()).toEqual(scenario.portfolioMessages[other.session.id])
  expect((await read(`/session/${other.session.id}/message`, scenario.projectDirectory)).status).toBe(404)
  expect(await (await read("/project/current", other.session.directory)).json()).toEqual(other.project)
  await fetch(`${handle.base}/__e2e__/step`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "portfolio-goals" }),
  })
  expect(await (await read(`/session/${other.session.id}/goal`, other.session.directory)).json()).toEqual(other.goal)
  expect(await (await read(`/session/${other.session.id}/goal`, scenario.projectDirectory)).json()).toBeNull()
  expect(await (await read(`/session/${scenario.session.id}/goal`, other.session.directory)).json()).toBeNull()
  await fetch(`${handle.base}/__e2e__/step`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "reset" }),
  })
  expect(await (await read(`/session/${other.session.id}/goal`, other.session.directory)).json()).toBeNull()
})

test("review scopes opt in to session diffs and only the latest user message's turn summary", async () => {
  const scenario = buildE2eScenario({ directory: "/tmp/review/project", portfolio: true })
  const targets = [scenario.session, scenario.portfolio[0].session]
  for (const target of targets) {
    const [latest] = scenario.portfolioMessages[target.id]
    latest.info.summary = { title: "Preserved summary", diffs: [] }
    scenario.portfolioMessages[target.id] = [
      { info: { ...latest.info, id: `${latest.info.id}_earlier`, summary: { diffs: [] } }, parts: [] },
      latest,
      { info: { id: `${latest.info.id}_reply`, sessionID: target.id, role: "assistant" }, parts: [] },
    ]
  }
  // Exercise the generated server's real routing even in sandboxes that cannot bind loopback sockets.
  let routeRequest
  runInNewContext(buildStubRuntimeScript(), {
    URL, Buffer,
    process: { argv: ["node", "stub", "serve"], env: { [STUB_SCENARIO_ENV]: "/tmp/review/scenario.json" }, on() {} },
    require: name => {
      if (name === "node:path") return path
      if (name === "node:fs") return { readFileSync: () => JSON.stringify(scenario) }
      if (name === "node:http") return { createServer: callback => { routeRequest = callback; return { listen() {} } } }
      throw new Error(`Unexpected stub dependency: ${name}`)
    },
  })
  const request = (url, { method = "GET", headers = {}, body } = {}) => new Promise(resolve => {
    const req = Object.assign(new EventEmitter(), { url, method, headers })
    const res = { statusCode: 200, setHeader() {}, end: data => resolve(new Response(data, { status: res.statusCode })) }
    routeRequest(req, res)
    if (body) req.emit("data", Buffer.from(body))
    req.emit("end")
  })
  const read = (target, route, directory = target.directory, method = "GET") => request(
    `/session/${target.id}/${route}?directory=${encodeURIComponent(directory)}`, { method },
  )
  const step = step => request("/__e2e__/step", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step }),
  })
  for (const target of targets) {
    expect(await (await read(target, "diff")).json()).toEqual({})
    expect(await (await read(target, "message")).json()).toEqual(scenario.portfolioMessages[target.id])
  }
  expect((await step("review-scopes")).ok).toBe(true)
  for (const target of targets) {
    const response = await read(target, "diff")
    expect(response.status).toBe(200)
    const diffs = await response.json()
    expect(diffs.map(diff => diff.file)).toEqual(["session/overview.txt", "session/last-turn.txt"])
    for (const diff of diffs) {
      expect(diff).toEqual({
        file: expect.any(String), before: expect.any(String), after: expect.any(String),
        additions: 1, deletions: 1, status: "modified",
      })
      expect(diff.before).not.toBe(diff.after)
    }
    const messages = await (await read(target, "message")).json()
    const original = scenario.portfolioMessages[target.id]
    expect(messages).toEqual([
      original[0],
      { ...original[1], info: { ...original[1].info, summary: { ...original[1].info.summary, diffs: [diffs[1]] } } },
      original[2],
    ])
    const other = targets.find(entry => entry.id !== target.id)
    expect((await read(target, "diff", other.directory)).status).toBe(404)
    expect((await read(target, "message", other.directory)).status).toBe(404)
    const headerScoped = await request(`/session/${target.id}/diff`, { headers: { "x-ax-code-directory": target.directory } })
    expect(await headerScoped.json()).toEqual(diffs)
    expect(await (await read(target, "diff", target.directory, "POST")).json()).toEqual({})
  }
  expect(await (await read({ ...targets[0], id: "unknown-session" }, "diff")).json()).toEqual({})
  expect((await step("reset")).ok).toBe(true)
  for (const target of targets) {
    expect(await (await read(target, "diff")).json()).toEqual({})
    expect(await (await read(target, "message")).json()).toEqual(scenario.portfolioMessages[target.id])
  }
})

spawnTest("Hooks fixtures isolate directories, preserve default behavior and expose failures", async () => {
  const scenario = buildE2eScenario({ directory: "/tmp/hooks/project", portfolio: true })
  const handle = await startStub({ scenario })
  expect(await (await fetch(`${handle.base}/hooks`)).json()).toEqual({})
  const workspaces = [scenario.projectDirectory, scenario.portfolio[0].project.worktree].map((directory, index) => ({
    directory, workspace: { marker: `project-${index}` }, delayMs: index === 0 ? 40 : 0,
  }))
  const seed = (workspaces) => fetch(`${handle.base}/__e2e__/hooks`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaces }),
  })
  await seed(workspaces)
  for (const entry of workspaces) {
    expect(await (await fetch(`${handle.base}/hooks?directory=${encodeURIComponent(entry.directory)}`)).json()).toEqual(entry.workspace)
  }
  expect((await fetch(`${handle.base}/hooks?directory=/unknown`)).status).toBe(404)
  expect((await (await fetch(`${handle.base}/__e2e__/hooks`)).json()).reads).toHaveLength(3)
  await seed([{ ...workspaces[0], status: 503, workspace: { message: "Hooks temporarily unavailable" } }])
  const failed = await fetch(`${handle.base}/hooks`, { headers: { "x-ax-code-directory": scenario.projectDirectory } })
  expect(failed.status).toBe(503)
  expect(await failed.json()).toEqual({ message: "Hooks temporarily unavailable" })
})

spawnTest("portfolio scheduled reads isolate duplicate task IDs and histories by directory", async () => {
  const scenario = buildE2eScenario({ directory: "/tmp/portfolio/project", portfolio: true })
  const handle = await startStub({ scenario })
  const tasks = [scenario.projectDirectory, scenario.portfolio[0].project.worktree].map((directory, index) => ({
    task: { id: "same-id", directory, title: "Nightly", prompt: `Project ${index}` },
    history: [{ id: `run-${index}`, taskID: "same-id", status: "completed", time: { created: 1 } }],
  }))
  await fetch(`${handle.base}/__e2e__/scheduled-tasks`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tasks }),
  })
  for (const entry of tasks) {
    const query = `?directory=${encodeURIComponent(entry.task.directory)}`
    expect(await (await fetch(`${handle.base}/scheduled-task${query}`)).json()).toEqual([entry.task])
    expect(await (await fetch(`${handle.base}/scheduled-task/same-id/runs${query}`)).json()).toEqual(entry.history)
  }
  expect(await (await fetch(`${handle.base}/scheduled-task?directory=/unknown`)).json()).toEqual([])
  expect(await (await fetch(`${handle.base}/scheduled-task/same-id/runs?directory=/unknown`)).json()).toEqual([])
})

describe("buildE2eScenario", () => {
  test("describes one session, two distinct requests and a blocked budget goal", () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    expect(scenario.projectDirectory).toBe("/tmp/e2e-project")
    expect(scenario.project).toEqual({ id: scenario.session.projectID, worktree: "/tmp/e2e-project" })
    expect(scenario.session.directory).toBe("/tmp/e2e-project")
    expect(scenario.session.title).toBeTruthy()
    expect(scenario.session.time).toEqual({ created: 1_700_000_000_000, updated: 1_700_000_000_000 })
    expect(scenario.approveRequest.sessionID).toBe(scenario.session.id)
    expect(scenario.denyRequest.sessionID).toBe(scenario.session.id)
    expect(scenario.approveRequest.id).not.toBe(scenario.denyRequest.id)
    expect(scenario.approveRequest.patterns).toEqual([E2E_APPROVE_PATTERN])
    expect(scenario.denyRequest.patterns).toEqual([E2E_DENY_PATTERN])
    expect(scenario.goal).toMatchObject({
      sessionID: scenario.session.id,
      objective: E2E_GOAL_OBJECTIVE,
      status: "blocked",
      tokenBudget: 500,
      tokensUsed: 125,
      remainingTokens: 375,
    })
    expect(scenario.foreignGoal.sessionID).toBe(E2E_FOREIGN_SESSION_ID)
    expect(scenario.foreignGoal.objective).not.toBe(scenario.goal.objective)
    expect(scenario.updatedGoal).toMatchObject({
      sessionID: scenario.session.id,
      objective: E2E_GOAL_UPDATED_OBJECTIVE,
      status: "blocked",
      tokensUsed: 200,
      remainingTokens: 300,
    })
    expect(scenario.updatedGoal.time.created).toBe(1_700_000_000_000)
    expect(scenario.updatedGoal.time.updated).toBeGreaterThan(scenario.goal.time.updated)
  })

  test("requires a project directory", () => {
    expect(() => buildE2eScenario({})).toThrow(/project directory/)
    expect(() => buildE2eScenario({ directory: "  " })).toThrow(/project directory/)
  })

  test("parseReplyLog reads one JSON record per line and ignores blanks", () => {
    expect(parseReplyLog('{"requestID":"a","reply":"once"}\n\n{"requestID":"b","reply":"reject"}\n')).toEqual([
      { requestID: "a", reply: "once" },
      { requestID: "b", reply: "reject" },
    ])
    expect(parseReplyLog("")).toEqual([])
    // Newer records carry the attempt outcome and both directories; older
    // lines without them still parse unchanged.
    expect(
      parseReplyLog(
        '{"requestID":"a","reply":"once","directory":"/tmp/p","effectiveDirectory":"/tmp/p","accepted":true}\n',
      ),
    ).toEqual([
      { requestID: "a", reply: "once", directory: "/tmp/p", effectiveDirectory: "/tmp/p", accepted: true },
    ])
  })
})

describe("reply attempt problems", () => {
  const base = { requestID: "perm_a", expectedReply: "once", projectDirectory: "/tmp/e2e-project" }
  const accepted = {
    requestID: "perm_a",
    reply: "once",
    directory: "/tmp/e2e-project",
    effectiveDirectory: "/tmp/e2e-project",
    accepted: true,
  }

  test("accepts exactly one accepted attempt that sent the project directory", () => {
    expect(findReplyAttemptProblems([accepted], base)).toEqual([])
  })

  test("fails a double submission even though one attempt was accepted", () => {
    const problems = findReplyAttemptProblems([accepted, { ...accepted, accepted: false }], base)
    expect(problems.join(" ")).toMatch(/exactly one reply attempt.*found 2/)
  })

  test("fails when the renderer sent no directory or the wrong one", () => {
    expect(findReplyAttemptProblems([{ ...accepted, directory: null }], base).join(" ")).toMatch(/sent directory null/)
    expect(findReplyAttemptProblems([{ ...accepted, directory: "/elsewhere" }], base).join(" ")).toMatch(/\/elsewhere/)
  })

  test("fails a rejected-only log and a wrong reply", () => {
    expect(findReplyAttemptProblems([{ ...accepted, accepted: false }], base).join(" ")).toMatch(/not accepted/)
    expect(findReplyAttemptProblems([{ ...accepted, reply: "always" }], base).join(" ")).toMatch(/"always"/)
    expect(findReplyAttemptProblems([], base).join(" ")).toMatch(/found 0/)
  })
})

describe("path containment", () => {
  test("accepts files strictly inside the directory and rejects escapes", () => {
    expect(isPathInsideDirectory("/tmp/launch/replies.jsonl", "/tmp/launch")).toBe(true)
    expect(isPathInsideDirectory("/tmp/launch/nested/origin.txt", "/tmp/launch")).toBe(true)
    expect(isPathInsideDirectory("/tmp/launch", "/tmp/launch")).toBe(false)
    expect(isPathInsideDirectory("/tmp/other/replies.jsonl", "/tmp/launch")).toBe(false)
    expect(isPathInsideDirectory("/tmp/launch/../other/replies.jsonl", "/tmp/launch")).toBe(false)
    expect(isPathInsideDirectory("", "/tmp/launch")).toBe(false)
    expect(assertPathInsideDirectory("/tmp/launch/replies.jsonl", "/tmp/launch", "Replies path")).toBe(
      "/tmp/launch/replies.jsonl",
    )
    expect(() => assertPathInsideDirectory("/tmp/other/x", "/tmp/launch", "Replies path")).toThrow(/Replies path/)
  })
})

describe("stub runtime without a scenario", () => {
  spawnTest("keeps the empty-runtime responses and has no step route", async () => {
    const stub = await startStub()
    const health = await (await fetch(`${stub.base}/global/health`)).json()
    expect(health).toEqual({ healthy: true, version: "9.9.9-test" })
    expect(await (await fetch(`${stub.base}/session?directory=/tmp/e2e-project`)).json()).toEqual([])
    expect(await (await fetch(`${stub.base}/experimental/session`)).json()).toEqual([])
    expect(await (await fetch(`${stub.base}/permission`)).json()).toEqual([])
    expect(await (await fetch(`${stub.base}/project`)).json()).toEqual([])
    expect(await (await fetch(`${stub.base}/session/ses_x/goal`)).json()).toEqual({})
    const step = await fetch(`${stub.base}/__e2e__/step`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "goal" }),
    })
    // Legacy behaviour without a scenario: the step route falls through to
    // the generic empty-object response, byte-identical to before scenarios.
    expect(step.status).toBe(200)
    expect(await step.json()).toEqual({})
  }, 20_000)
})

describe("stub runtime with a scenario", () => {
  spawnTest("serves the session only for its directory and starts with the approve request pending", async () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    const stub = await startStub({ scenario })
    expect(await (await fetch(`${stub.base}/session?directory=/tmp/e2e-project&roots=true`)).json()).toEqual([
      scenario.session,
    ])
    expect(await (await fetch(`${stub.base}/session?directory=/somewhere/else`)).json()).toEqual([])
    expect(await (await fetch(`${stub.base}/experimental/session?archived=false`)).json()).toEqual([scenario.session])
    // The runtime's archived=true query means "include archived", not "only archived".
    expect(await (await fetch(`${stub.base}/experimental/session?archived=true`)).json()).toEqual([scenario.session])
    expect(await (await fetch(`${stub.base}/project`)).json()).toEqual([scenario.project])
    expect(await (await fetch(`${stub.base}/project/current?directory=/tmp/e2e-project`)).json()).toEqual(
      scenario.project,
    )
    expect(await (await fetch(`${stub.base}/permission?directory=/tmp/e2e-project`)).json()).toEqual([
      scenario.approveRequest,
    ])
    // Pending permissions are scoped to a directory: another project the app bootstraps must not receive the request.
    expect(await (await fetch(`${stub.base}/permission?directory=/somewhere/else`)).json()).toEqual([])
    expect(
      await (
        await fetch(`${stub.base}/permission`, { headers: { "x-ax-code-directory": "/somewhere/else" } })
      ).json(),
    ).toEqual([])
    expect(await (await fetch(`${stub.base}/session/${scenario.session.id}/goal`)).json()).toBeNull()
  }, 20_000)

  spawnTest("records every reply attempt, clears the pending list and emits permission.replied", async () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    const stub = await startStub({ scenario })
    const controller = new AbortController()
    const frames = []
    const sawReplied = (async () => {
      const response = await fetch(`${stub.base}/global/event`, { signal: controller.signal })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        for (const chunk of buffer.split("\n\n")) {
          const line = chunk.split("\n").find((entry) => entry.startsWith("data: "))
          if (!line) continue
          try {
            frames.push(JSON.parse(line.slice(6)))
          } catch {}
        }
        if (frames.some((frame) => frame.payload?.type === "permission.replied")) return
      }
    })()
    try {
      const asked = await Promise.race([
        (async () => {
          while (!frames.some((frame) => frame.payload?.type === "permission.asked")) await sleep(25)
          return true
        })(),
        sleep(5000).then(() => false),
      ])
      expect(asked).toBe(true)
      const reply = await fetch(
        `${stub.base}/permission/${scenario.approveRequest.id}/reply?directory=${encodeURIComponent("/tmp/e2e-project")}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reply: "once" }),
        },
      )
      expect(reply.ok).toBe(true)
      expect(await reply.json()).toBe(true)
      await Promise.race([sawReplied, sleep(5000)])
      expect(frames.some((frame) => frame.payload?.type === "permission.replied")).toBe(true)
      expect(await readReplies(stub)).toEqual([
        {
          requestID: scenario.approveRequest.id,
          reply: "once",
          directory: "/tmp/e2e-project",
          effectiveDirectory: "/tmp/e2e-project",
          accepted: true,
        },
      ])
      expect(await (await fetch(`${stub.base}/permission`)).json()).toEqual([])
      const again = await fetch(`${stub.base}/permission/${scenario.approveRequest.id}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply: "once" }),
      })
      expect(again.status).toBe(404)
      // The duplicate attempt is recorded as rejected, not silently dropped.
      expect(await readReplies(stub)).toEqual([
        {
          requestID: scenario.approveRequest.id,
          reply: "once",
          directory: "/tmp/e2e-project",
          effectiveDirectory: "/tmp/e2e-project",
          accepted: true,
        },
        {
          requestID: scenario.approveRequest.id,
          reply: "once",
          directory: null,
          effectiveDirectory: "/tmp/e2e-project",
          accepted: false,
        },
      ])
    } finally {
      controller.abort()
    }
  }, 20_000)

  spawnTest("arms the deny request and the goal only through scenario steps", async () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    const stub = await startStub({ scenario })
    const post = (step) =>
      fetch(`${stub.base}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      })
    expect((await post("deny")).ok).toBe(true)
    expect(await (await fetch(`${stub.base}/permission`)).json()).toEqual([
      scenario.approveRequest,
      scenario.denyRequest,
    ])
    const deny = await fetch(`${stub.base}/permission/${scenario.denyRequest.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply: "reject", message: "not now" }),
    })
    expect(deny.ok).toBe(true)
    // No directory was sent on this reply: the incoming directory is null
    // and only the effective directory falls back to the scenario project.
    expect(await readReplies(stub)).toEqual([
      {
        requestID: scenario.denyRequest.id,
        reply: "reject",
        message: "not now",
        directory: null,
        effectiveDirectory: "/tmp/e2e-project",
        accepted: true,
      },
    ])
    expect((await post("goal")).ok).toBe(true)
    expect(await (await fetch(`${stub.base}/session/${scenario.session.id}/goal`)).json()).toEqual(scenario.goal)
    expect((await post("bogus")).status).toBe(400)
    expect(await fs.readFile(path.join(stub.dir, "origin.txt"), "utf8")).toBe(stub.base)
  }, 20_000)

  spawnTest("reset clears pending and goal state so each journey arms only what it needs", async () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    const stub = await startStub({ scenario })
    const post = (step) =>
      fetch(`${stub.base}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      })
    const pending = async () => (await fetch(`${stub.base}/permission`)).json()
    const goalFor = async (id) => (await fetch(`${stub.base}/session/${id}/goal`)).json()
    expect((await post("goal")).ok).toBe(true)
    expect(await goalFor(scenario.session.id)).toEqual(scenario.goal)
    expect((await post("reset")).ok).toBe(true)
    expect(await pending()).toEqual([])
    expect(await goalFor(scenario.session.id)).toBeNull()
    expect((await post("approve")).ok).toBe(true)
    expect(await pending()).toEqual([scenario.approveRequest])
    expect((await post("reset")).ok).toBe(true)
    expect((await post("deny")).ok).toBe(true)
    expect(await pending()).toEqual([scenario.denyRequest])
  }, 20_000)

  spawnTest("foreign goal and later revision are separate steps in stream order", async () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    const stub = await startStub({ scenario })
    const post = (step) =>
      fetch(`${stub.base}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      })
    const goalFor = async (id) => (await fetch(`${stub.base}/session/${id}/goal`)).json()
    expect((await post("goal")).ok).toBe(true)
    expect(await goalFor(scenario.session.id)).toEqual(scenario.goal)
    expect(await goalFor(scenario.foreignGoal.sessionID)).toBeNull()
    expect((await post("foreign-goal")).ok).toBe(true)
    expect(await goalFor(scenario.session.id)).toEqual(scenario.goal)
    expect(await goalFor(scenario.foreignGoal.sessionID)).toEqual(scenario.foreignGoal)
    expect((await post("goal-revision")).ok).toBe(true)
    expect(await goalFor(scenario.session.id)).toEqual(scenario.updatedGoal)
    expect(scenario.updatedGoal.time.updated).toBeGreaterThan(scenario.goal.time.updated)
  }, 20_000)

  spawnTest("never writes the origin file or reply log outside the scenario directory", async () => {
    const scenario = buildE2eScenario({ directory: "/tmp/e2e-project", now: 1_700_000_000_000 })
    const outsideOrigin = path.join(os.tmpdir(), `ax-code-e2e-outside-origin-${process.pid}.txt`)
    const outsideReplies = path.join(os.tmpdir(), `ax-code-e2e-outside-replies-${process.pid}.jsonl`)
    await fs.rm(outsideOrigin, { force: true })
    await fs.rm(outsideReplies, { force: true })
    try {
      const stub = await startStub({ scenario, originFile: outsideOrigin, repliesPath: outsideReplies })
      const reply = await fetch(
        `${stub.base}/permission/${scenario.approveRequest.id}/reply?directory=${encodeURIComponent("/tmp/e2e-project")}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reply: "once" }),
        },
      )
      expect(reply.ok).toBe(true)
      await expect(fs.access(outsideOrigin)).rejects.toThrow()
      await expect(fs.access(outsideReplies)).rejects.toThrow()
    } finally {
      await fs.rm(outsideOrigin, { force: true })
      await fs.rm(outsideReplies, { force: true })
    }
  }, 20_000)
})

spawnTest("project browser stub enrolls a real session and retires only the disconnected provider", async () => {
  const scenario = buildE2eScenario({ directory: "/tmp/browser-fixture" })
  const stub = await startStub({ scenario })
  const call = (route, method = "GET", body) => fetch(`${stub.base}/desktop/browser${route}?directory=${encodeURIComponent(scenario.session.directory)}`, {
    method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  })
  expect(await (await call("/capability")).json()).toEqual({ capability: "desktop.webmcp.v1", browserMode: "embedded" })
  expect((await call("/provider", "POST", { sessionID: "foreign" })).status).toBe(404)
  const connection = await (await call("/provider", "POST", { sessionID: scenario.session.id })).json()
  expect(connection.projectID).toBe(scenario.project.id)
  expect(await (await call(`/provider/${connection.providerID}/next`)).json()).toEqual({ canceled: [] })
  expect((await call(`/provider/${connection.providerID}/state`, "PUT", {})).ok).toBe(true)
  await call(`/provider/${connection.providerID}`, "DELETE")
  expect((await call(`/provider/${connection.providerID}/next`)).status).toBe(404)
})

test("scripted page-tool tasks gate native calls on one-use approval and expire unanswered asks", async () => {
  const scenario = buildE2eScenario({ directory: "/tmp/browser-task-fixture", portfolio: true })
  let routeRequest
  runInNewContext(buildStubRuntimeScript(), {
    URL, Buffer, setTimeout, clearTimeout,
    process: { argv: ["node", "stub", "serve"], env: { [STUB_SCENARIO_ENV]: "/tmp/browser-task/scenario.json" }, on() {} },
    require: name => {
      if (name === "node:path") return path
      if (name === "node:fs") return { readFileSync: () => JSON.stringify(scenario) }
      if (name === "node:http") return { createServer: callback => { routeRequest = callback; return { listen() {} } } }
      throw new Error(`Unexpected stub dependency: ${name}`)
    },
  })
  const request = (route, method = "GET", body) => new Promise(resolve => {
    const req = Object.assign(new EventEmitter(), {
      url: `${route}?directory=${encodeURIComponent(scenario.projectDirectory)}`, method, headers: {},
    })
    const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader() {},
      end: data => resolve({ status: res.statusCode, value: JSON.parse(data) }),
    })
    routeRequest(req, res)
    if (body) req.emit("data", Buffer.from(JSON.stringify(body)))
    req.emit("end")
  })
  const sessionID = scenario.session.id
  const { value: connection } = await request("/desktop/browser/provider", "POST", {
    sessionID, snapshot: { origin: "http://127.0.0.1", generation: "page-1", frameId: "top" },
  })
  const provider = `/desktop/browser/provider/${connection.providerID}`
  await request("/__e2e__/browser-task", "POST", {
    sessionID, requestID: "approved", toolName: "edit", digest: "definition", input: { text: "exact" }, approval: true,
  })
  expect((await request(`${provider}/next`)).value.request).toBeUndefined()
  const permissions = (await request("/permission")).value
  expect(permissions[0]).toMatchObject({ id: "perm_approved", metadata: { origin: "http://127.0.0.1", definitionDigest: "definition" } })
  expect((await request("/permission/perm_approved/reply", "POST", { reply: "once" })).status).toBe(200)
  expect((await request(`${provider}/next`)).value.request).toMatchObject({ operation: "invoke", toolName: "edit", digest: "definition", input: { text: "exact" } })
  expect((await request("/permission/perm_approved/reply", "POST", { reply: "once" })).status).toBe(404)
  await request(`${provider}/reply`, "POST", { requestID: "approved", status: "Completed", output: JSON.stringify({ text: "exact" }) })
  const approvedMessages = (await request(`/session/${sessionID}/message`)).value
  expect(JSON.parse(approvedMessages.at(-1).parts[0].state.output)).toEqual({ text: "exact" })
  await request("/__e2e__/browser-task", "POST", {
    sessionID, requestID: "expired", toolName: "edit", digest: "definition", approval: true, expireMs: 20, newTurn: true,
  })
  await sleep(50)
  expect((await request("/permission")).value).toEqual([])
  expect((await request(`${provider}/next`)).value.request).toBeUndefined()
  const messages = (await request(`/session/${sessionID}/message`)).value
  expect(messages.at(-1).parts[0].state.output).toContain("Scripted approval expired without an answer")
  expect(messages.at(-2).info.role).toBe("user")
  expect(messages.map(message => message.info.id)).toEqual(messages.map(message => message.info.id).sort())
  expect((await request("/permission/perm_expired/reply", "POST", { reply: "once" })).status).toBe(404)
})
