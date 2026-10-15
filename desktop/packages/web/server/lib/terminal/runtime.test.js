import { EventEmitter } from "node:events"
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  TERMINAL_OUTPUT_WS_MAX_BUFFERED_BYTES,
  TERMINAL_SHELL_STARTUP_GRACE_MS,
  createTerminalRuntime,
  isTerminalOutputClientStalled,
  observeTerminalShellStartup,
  sanitizeTerminalEnv,
} from "./runtime.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

function createRuntime(server, overrides = {}) {
  const app = overrides.app ?? {
    post() {},
    get() {},
    delete() {},
  }

  return createTerminalRuntime({
    app,
    server,
    express: { text: () => (_req, _res, next) => next?.() },
    fs,
    path,
    uiAuthController: null,
    buildAugmentedPath: () => process.env.PATH || "",
    searchPathFor: () => null,
    isExecutable: () => false,
    isRequestOriginAllowed: async () => true,
    rejectWebSocketUpgrade() {},
    markWebSocketUpgradeClaimed() {},
    TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 30_000,
    TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1_000,
    TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW: 3,
    ...overrides,
  })
}

describe("terminal runtime", () => {
  it("rejects a shell that emits output and then exits during startup", async () => {
    let onData = null
    let onExit = null
    const ptyProcess = {
      onData(callback) {
        onData = callback
        return { dispose() {} }
      },
      onExit(callback) {
        onExit = callback
        return { dispose() {} }
      },
    }

    const outcomePromise = observeTerminalShellStartup(ptyProcess, 50)
    onData("startup banner\\r\\n")
    setTimeout(() => onExit({ exitCode: 139, signal: 11 }), 1)

    await expect(outcomePromise).resolves.toEqual({
      crashed: true,
      exitCode: 139,
      signal: 11,
      earlyOutput: "startup banner\\r\\n",
    })
  })

  it("keeps a shell under observation long enough to catch delayed startup exits", async () => {
    let onExit = null
    const ptyProcess = {
      onData() {
        return { dispose() {} }
      },
      onExit(callback) {
        onExit = callback
        return { dispose() {} }
      },
    }

    const outcomePromise = observeTerminalShellStartup(ptyProcess, TERMINAL_SHELL_STARTUP_GRACE_MS)
    setTimeout(() => onExit({ exitCode: 0, signal: 11 }), 550)

    await expect(outcomePromise).resolves.toMatchObject({
      crashed: true,
      exitCode: 0,
      signal: 11,
    })
  })

  it("keeps collecting startup output until release() after a healthy start", async () => {
    let onData = null
    let disposed = false
    const ptyProcess = {
      onData(callback) {
        onData = callback
        return {
          dispose() {
            disposed = true
          },
        }
      },
      onExit() {
        return { dispose() {} }
      },
    }

    const outcomePromise = observeTerminalShellStartup(ptyProcess, 20)
    onData("prompt> ")
    const outcome = await outcomePromise

    expect(outcome.crashed).toBe(false)
    expect(outcome.earlyOutput).toBe("prompt> ")
    expect(disposed).toBe(false)
    expect(typeof outcome.release).toBe("function")

    onData("more")
    expect(outcome.release()).toBe("prompt> more")
    expect(disposed).toBe(true)
  })

  it("rejects terminal working directories that are not approved", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createRuntime(server, {
      app,
      fs: {
        promises: {
          stat: async () => {
            throw new Error("stat should not run before cwd authorization")
          },
        },
      },
      validateCwd: async () => ({ ok: false, error: "Path is outside of approved directories" }),
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => "",
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
    })

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const res = createMockResponse()

      await createRoute({ body: { cwd: "/tmp/not-approved" } }, res)

      expect(res.statusCode).toBe(403)
      expect(res.body).toEqual({ error: "Path is outside of approved directories" })
    } finally {
      await runtime.shutdown()
    }
  })

  it("rejects regular files as terminal working directories", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createRuntime(server, {
      app,
      fs: {
        promises: {
          stat: async () => ({ isDirectory: () => false }),
        },
      },
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => "",
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
    })

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const res = createMockResponse()

      await createRoute({ body: { cwd: "/tmp/not-a-directory" } }, res)

      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: "Invalid working directory" })
    } finally {
      await runtime.shutdown()
    }
  })

  it("removes its websocket upgrade listener on shutdown", async () => {
    const server = new EventEmitter()
    const runtime = createRuntime(server)

    expect(server.listenerCount("upgrade")).toBe(1)

    await runtime.shutdown()

    expect(server.listenerCount("upgrade")).toBe(0)
  })

  it("rejects websocket upgrades from disallowed origins even when UI auth is disabled", async () => {
    const server = new EventEmitter()
    const rejections = []
    const runtime = createRuntime(server, {
      uiAuthController: null,
      isRequestOriginAllowed: async () => false,
      rejectWebSocketUpgrade(_socket, statusCode, reason) {
        rejections.push({ statusCode, reason })
      },
    })

    try {
      server.emit("upgrade", { url: "/api/terminal/ws", headers: {} }, { destroyed: false }, Buffer.alloc(0))
      await new Promise((resolve) => setTimeout(resolve, 5))

      expect(rejections).toEqual([{ statusCode: 403, reason: "Invalid origin" }])
    } finally {
      await runtime.shutdown()
    }
  })
})

describe("terminal runtime error visibility", () => {
  it("logs when ptyProcess.kill throws during force-kill instead of swallowing the error", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()

    const warnings = []
    const originalWarn = console.warn
    console.warn = (...args) => {
      warnings.push(args.map(String).join(" "))
    }

    const killingPty = {
      pid: 0,
      onData() {
        return { dispose() {} }
      },
      onExit() {
        return { dispose() {} }
      },
      kill() {
        throw new Error("simulated kill failure")
      },
    }

    const runtime = createRuntime(server, {
      app,
      fs: {
        promises: {
          stat: async () => ({ isDirectory: () => true }),
        },
      },
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => process.env.PATH || "",
      searchPathFor: (name) => name,
      isExecutable: () => true,
      validateCwd: async (cwd) => ({ ok: true, cwd }),
      getPtyProvider: async () => ({
        backend: "test-mock",
        spawn: () => killingPty,
      }),
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
      TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW: 3,
    })

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const createRes = createMockResponse()
      await createRoute({ body: { cwd: process.cwd(), cols: 80, rows: 24 } }, createRes)
      expect(createRes.statusCode).toBe(200)
      expect(createRes.body?.sessionId).toBeTruthy()

      const forceKill = getRoute("POST", "/api/terminal/force-kill")
      const killRes = createMockResponse()
      forceKill({ body: { sessionId: createRes.body.sessionId } }, killRes)

      expect(killRes.statusCode).toBe(200)
      expect(killRes.body).toEqual({ success: true, killedCount: 1 })
      expect(
        warnings.some(
          (line) => line.includes("Failed to kill terminal process") && line.includes("simulated kill failure"),
        ),
      ).toBe(true)
    } finally {
      console.warn = originalWarn
      await runtime.shutdown()
    }
  })
})

describe("terminal restart", () => {
  it("keeps the existing session alive when the restart's new cwd fails validation", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const writes = []
    const kills = []
    const makeFakePty = () => ({
      onData: () => ({ dispose() {} }),
      onExit: () => ({ dispose() {} }),
      write: (data) => writes.push(data),
      kill: () => kills.push(1),
      resize: () => {},
    })
    const runtime = createRuntime(server, {
      app,
      getPtyProvider: async () => ({ backend: "mock", spawn: () => makeFakePty() }),
      isExecutable: () => true,
      validateCwd: async (_req, cwd) =>
        cwd === "/gone" ? { ok: false, error: "Path is outside of approved directories" } : { ok: true, cwd },
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => "",
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
    })

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const createRes = createMockResponse()
      await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, createRes)
      const sessionId = createRes.body?.sessionId
      expect(sessionId).toBeTruthy()

      const restartRoute = getRoute("POST", "/api/terminal/:sessionId/restart")
      const restartRes = createMockResponse()
      await restartRoute({ params: { sessionId }, body: { cwd: "/gone", cols: 80, rows: 24 } }, restartRes)
      expect(restartRes.statusCode).toBe(403)

      // The old session must survive a rejected restart: input still routes to it.
      const inputRoute = getRoute("POST", "/api/terminal/:sessionId/input")
      const inputRes = createMockResponse()
      await inputRoute({ params: { sessionId }, body: "ls\n" }, inputRes)
      expect(inputRes.body).toEqual({ success: true })
      expect(writes).toContain("ls\n")
      expect(kills).toHaveLength(0)
    } finally {
      await runtime.shutdown()
    }
  })

  it("enforces the session cap when restarting a stale session id", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const makeFakePty = () => ({
      onData: () => ({ dispose() {} }),
      onExit: () => ({ dispose() {} }),
      write: () => {},
      kill: () => {},
      resize: () => {},
    })
    const runtime = createRuntime(server, {
      app,
      getPtyProvider: async () => ({ backend: "mock", spawn: () => makeFakePty() }),
      isExecutable: () => true,
      validateCwd: async (_req, cwd) => ({ ok: true, cwd }),
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => "",
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
      MAX_TERMINAL_SESSIONS: 2,
    })

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const restartRoute = getRoute("POST", "/api/terminal/:sessionId/restart")

      let liveSessionId = null
      for (let index = 0; index < 2; index += 1) {
        const createRes = createMockResponse()
        await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, createRes)
        expect(createRes.statusCode).toBe(200)
        liveSessionId = createRes.body?.sessionId
      }

      // The cap is full: restarting an id nobody holds must not spawn a new session.
      const staleRes = createMockResponse()
      await restartRoute(
        { params: { sessionId: "0".repeat(48) }, body: { cwd: "/tmp", cols: 80, rows: 24 } },
        staleRes,
      )
      expect(staleRes.statusCode).toBe(429)

      // Restarting a live session swaps it in place and stays under the cap.
      const liveRes = createMockResponse()
      await restartRoute(
        { params: { sessionId: liveSessionId }, body: { cwd: "/tmp", cols: 80, rows: 24 } },
        liveRes,
      )
      expect(liveRes.statusCode).toBe(200)
      expect(liveRes.body?.sessionId).toBeTruthy()
    } finally {
      await runtime.shutdown()
    }
  })
})

describe("terminal session cap", () => {
  const makeFakePty = () => ({
    onData: () => ({ dispose() {} }),
    onExit: () => ({ dispose() {} }),
    write: () => {},
    kill: () => {},
    resize: () => {},
  })

  const createCappedRuntime = (app, server, maxSessions) =>
    createRuntime(server, {
      app,
      getPtyProvider: async () => ({ backend: "mock", spawn: () => makeFakePty() }),
      isExecutable: () => true,
      validateCwd: async (_req, cwd) => ({ ok: true, cwd }),
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => "",
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
      MAX_TERMINAL_SESSIONS: maxSessions,
    })

  it("counts spawns that are still in flight against the session cap", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createCappedRuntime(app, server, 2)

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const responses = [createMockResponse(), createMockResponse(), createMockResponse()]
      // The session is only registered at the end of the request (cwd check,
      // node-pty import and the shell startup grace window all await first), so
      // fire the creates together: only as many as the cap allows may succeed.
      await Promise.all(
        responses.map((res) => createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, res)),
      )

      expect(responses.map((res) => res.statusCode).sort()).toEqual([200, 200, 429])
      expect(responses.filter((res) => res.statusCode === 200).map((res) => res.body?.sessionId)).toEqual([
        expect.any(String),
        expect.any(String),
      ])
    } finally {
      await runtime.shutdown()
    }
  })

  it("releases the slot it reserved once a create finishes", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createCappedRuntime(app, server, 1)

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const closeRoute = getRoute("DELETE", "/api/terminal/:sessionId")

      const first = createMockResponse()
      await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, first)
      expect(first.statusCode).toBe(200)

      // The live session holds the only slot; a leaked reservation would show up
      // as a 429 that survives closing it.
      const blocked = createMockResponse()
      await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, blocked)
      expect(blocked.statusCode).toBe(429)

      const closeRes = createMockResponse()
      await closeRoute({ params: { sessionId: first.body.sessionId } }, closeRes)
      expect(closeRes.statusCode).toBe(200)

      const reopened = createMockResponse()
      await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, reopened)
      expect(reopened.statusCode).toBe(200)
    } finally {
      await runtime.shutdown()
    }
  })
})

describe("terminal output backpressure", () => {
  it("treats a socket with a modest buffer as healthy and a far-behind one as stalled", () => {
    expect(isTerminalOutputClientStalled({ bufferedAmount: 0 })).toBe(false)
    expect(isTerminalOutputClientStalled({ bufferedAmount: undefined })).toBe(false)
    expect(isTerminalOutputClientStalled({ bufferedAmount: TERMINAL_OUTPUT_WS_MAX_BUFFERED_BYTES })).toBe(false)
    // A stalled client must be disconnected instead of buffering pty output forever.
    expect(isTerminalOutputClientStalled({ bufferedAmount: TERMINAL_OUTPUT_WS_MAX_BUFFERED_BYTES + 1 })).toBe(true)
  })
})


describe("terminal shell env", () => {
  it("drops secrets and the unpaired embedded-browser marker", () => {
    const env = sanitizeTerminalEnv({
      PATH: "/usr/bin",
      AX_CODE_SERVER_PASSWORD: "secret",
      AX_CODE_BROWSER_MODE: "embedded",
      BASH_ENV: "/tmp/env",
    })

    expect(env.PATH).toBe("/usr/bin")
    expect(env.AX_CODE_SERVER_PASSWORD).toBeUndefined()
    // The token that pairs with the marker only exists in the runtime's own env; a
    // child inheriting the marker alone can use neither browser path.
    expect(env.AX_CODE_BROWSER_MODE).toBeUndefined()
    expect(env.BASH_ENV).toBeUndefined()
  })
})

describe("terminal restart slot reservation", () => {
  const makeFakePty = () => ({
    onData: () => ({ dispose() {} }),
    onExit: () => ({ dispose() {} }),
    write: () => {},
    kill: () => {},
    resize: () => {},
  })

  const createCapOneRuntime = (app, server) =>
    createRuntime(server, {
      app,
      getPtyProvider: async () => ({ backend: "mock", spawn: () => makeFakePty() }),
      isExecutable: () => true,
      validateCwd: async (_req, cwd) => ({ ok: true, cwd }),
      uiAuthController: { enabled: false },
      buildAugmentedPath: () => "",
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: 1000,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: 1000,
      MAX_TERMINAL_SESSIONS: 1,
    })

  it("holds the freed slot while a live restart's replacement is spawning", async () => {
    // Regression: the restart deleted the old session before spawning the
    // replacement, and a create arriving inside the spawn window took the freed
    // slot, so the replacement registered past the cap.
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createCapOneRuntime(app, server)

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const restartRoute = getRoute("POST", "/api/terminal/:sessionId/restart")

      const first = createMockResponse()
      await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, first)
      expect(first.statusCode).toBe(200)

      const restartRes = createMockResponse()
      const restartPromise = restartRoute(
        { params: { sessionId: first.body.sessionId }, body: { cwd: "/tmp", cols: 80, rows: 24 } },
        restartRes,
      )
      // Wait past the restart's cwd/stat awaits so it has freed the old slot and
      // is inside its spawn (startup grace) window.
      await new Promise((resolve) => setTimeout(resolve, 50))

      const concurrentCreate = createMockResponse()
      await createRoute({ body: { cwd: "/tmp", cols: 80, rows: 24 } }, concurrentCreate)
      expect(concurrentCreate.statusCode).toBe(429)

      await restartPromise
      expect(restartRes.statusCode).toBe(200)
      expect(restartRes.body?.sessionId).toBeTruthy()
    } finally {
      await runtime.shutdown()
    }
  })
})

describe("terminal body parsing tolerance", () => {
  it("answers a create without a parsed body with 400 instead of a thrown TypeError", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createRuntime(server, { app })

    try {
      const createRoute = getRoute("POST", "/api/terminal/create")
      const res = createMockResponse()
      await createRoute({ body: undefined }, res)
      expect(res.statusCode).toBe(400)
      expect(res.body).toEqual({ error: "cwd is required" })
    } finally {
      await runtime.shutdown()
    }
  })

  it("answers a force-kill without a parsed body without throwing", async () => {
    const { app, getRoute } = createRouteRegistry()
    const server = new EventEmitter()
    const runtime = createRuntime(server, { app })

    try {
      const forceKillRoute = getRoute("POST", "/api/terminal/force-kill")
      const res = createMockResponse()
      await forceKillRoute({ body: undefined }, res)
      expect(res.statusCode).toBe(200)
      expect(res.body).toEqual({ success: true, killedCount: 0 })
    } finally {
      await runtime.shutdown()
    }
  })
})
