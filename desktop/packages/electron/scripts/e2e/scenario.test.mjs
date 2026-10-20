import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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
import { STUB_REPLIES_ENV, STUB_SCENARIO_ENV, writeStubRuntime } from "./stub-runtime.mjs"

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
    expect(await (await fetch(`${stub.base}/experimental/session?archived=true`)).json()).toEqual([])
    expect(await (await fetch(`${stub.base}/project`)).json()).toEqual([scenario.project])
    expect(await (await fetch(`${stub.base}/project/current?directory=/tmp/e2e-project`)).json()).toEqual(
      scenario.project,
    )
    expect(await (await fetch(`${stub.base}/permission?directory=/tmp/e2e-project`)).json()).toEqual([
      scenario.approveRequest,
    ])
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
