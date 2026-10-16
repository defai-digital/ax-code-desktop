import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"

const spawnMock = vi.fn()
const spawnSyncMock = vi.fn()
const startHeadlessBackendMock = vi.fn()

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}))

vi.mock("@defai-digital/ax-code-sdk/headless", () => ({
  startHeadlessBackend: startHeadlessBackendMock,
  isLoopbackHostname: (hostname) => {
    if (!hostname) return true
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
    if (normalized === "localhost" || normalized === "::1") return true
    const parts = normalized.split(".")
    if (parts.length !== 4) return false
    const nums = parts.map(Number)
    return nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) && nums[0] === 127
  },
}))

// Keep the bootstrap retry loop fast in tests; the retry constants are read
// once when lifecycle.js is imported below.
process.env.AX_CODE_DESKTOP_BOOTSTRAP_RETRY_BASE_DELAY_MS = "50"
process.env.AX_CODE_DESKTOP_BOOTSTRAP_RETRY_MAX_DELAY_MS = "100"

const { createAxCodeLifecycleRuntime } = await import("./lifecycle.js")

const originalAxCodeBinary = process.env.AX_CODE_BINARY
const originalPath = process.env.PATH

afterEach(() => {
  spawnMock.mockReset()
  startHeadlessBackendMock.mockReset()
  if (typeof originalAxCodeBinary === "string") {
    process.env.AX_CODE_BINARY = originalAxCodeBinary
  } else {
    delete process.env.AX_CODE_BINARY
  }

  if (typeof originalPath === "string") {
    process.env.PATH = originalPath
  } else {
    delete process.env.PATH
  }
})

const createLiveSdkHandle = ({
  url = "http://127.0.0.1:45678",
  headers = { Authorization: "Basic test" },
  diagnostics = {},
  exit = { code: 1, signal: null },
} = {}) => {
  const live = { exitCode: null, signalCode: null }
  let resolveClosed = () => {}
  const closed = new Promise((resolve) => {
    resolveClosed = resolve
  })
  return {
    handle: {
      url,
      headers,
      close: vi.fn(async () => undefined),
      closed,
      diagnostics,
      get exitCode() {
        return live.exitCode
      },
      get signalCode() {
        return live.signalCode
      },
    },
    resolveClosed: () => {
      live.exitCode = exit.code
      live.signalCode = exit.signal
      resolveClosed()
    },
  }
}

const createLifecycleState = () => ({
  axCodeWorkingDirectory: "/tmp/project",
  axCodeProcess: null,
  axCodePort: null,
  axCodeBaseUrl: null,
  currentRestartPromise: null,
  isRestartingAxCode: false,
  axCodeApiPrefix: "",
  axCodeApiPrefixDetected: false,
  axCodeApiDetectionTimer: null,
  lastAxCodeError: null,
  isAxCodeReady: false,
  axCodeNotReadySince: 0,
  isExternalAxCode: false,
  isShuttingDown: false,
  healthCheckInterval: null,
  axCodeNextRetryAt: 0,
  axCodeRetryExhausted: false,
  expressApp: null,
  useWslForAxCode: false,
  resolvedWslBinary: null,
  resolvedWslAxCodePath: null,
  resolvedWslDistro: null,
})

const createRuntime = (overrides = {}) => {
  const state = overrides.state ?? createLifecycleState()

  return createAxCodeLifecycleRuntime({
    state,
    env: {
      ENV_CONFIGURED_AX_CODE_PORT: 45678,
      ENV_CONFIGURED_AX_CODE_HOST: null,
      ENV_EFFECTIVE_PORT: 3001,
      ENV_CONFIGURED_AX_CODE_HOSTNAME: "127.0.0.1",
      ENV_SKIP_AX_CODE_START: false,
    },
    syncToHmrState: vi.fn(),
    syncFromHmrState: vi.fn(),
    getAxCodeAuthHeaders: () => ({}),
    buildAxCodeUrl: (route) => `http://127.0.0.1:45678${route}`,
    waitForReady: vi.fn(async () => true),
    normalizeApiPrefix: vi.fn(() => ""),
    applyAxCodeBinaryFromSettings: vi.fn(async () => null),
    ensureAxCodeCliEnv: vi.fn(),
    ensureLocalAxCodeServerPassword: vi.fn(async () => "password"),
    buildWslExecArgs: vi.fn((args) => args),
    resolveWslExecutablePath: vi.fn(),
    resolveManagedAxCodeLaunchSpec: vi.fn((binary) => ({ binary, args: [], wrapperType: null })),
    setAxCodePort: vi.fn((port) => {
      state.axCodePort = port
    }),
    setDetectedAxCodeApiPrefix: vi.fn(),
    setupProxy: vi.fn(),
    ensureAxCodeApiPrefix: vi.fn(),
    clearResolvedAxCodeBinary: vi.fn(),
    buildAugmentedPath: vi.fn(() => "/home/user/.local/bin:/usr/local/bin:/usr/bin"),
    buildManagedAxCodePath: vi.fn(() => "/home/user/.local/bin:/usr/local/bin:/usr/bin"),
    getManagedAxCodeShellEnvSnapshot: vi.fn(() => ({
      PATH: "/home/user/.local/bin:/usr/local/bin:/usr/bin",
      SHELL_ONLY: "yes",
      AX_CODE_SERVER_PASSWORD: "shell-password",
    })),
    ...overrides,
  })
}

describe("ax-code lifecycle", () => {
  it("launches managed ax-code through the SDK headless backend with the managed PATH", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
    })

    const runtime = createRuntime()
    const server = await runtime.startAxCode()
    const options = startHeadlessBackendMock.mock.calls[0][0]

    expect(spawnMock).not.toHaveBeenCalled()
    expect(options.directory).toBe("/tmp/project")
    expect(options.hostname).toBe("127.0.0.1")
    expect(options.port).toBe(45678)
    expect(options.binary).toBe("ax-code")
    expect(options.args).toEqual(["serve", "--hostname", "127.0.0.1", "--port", "45678"])
    expect(options.env.PATH).toBe("/home/user/.local/bin:/usr/local/bin:/usr/bin")
    expect(options.env.SHELL_ONLY).toBe("yes")
    expect(options.env.AX_CODE_SERVER_PASSWORD).toBeUndefined()
    expect(options.auth).toEqual({ username: "ax-code", password: "password" })
    expect(options.allowNetworkBind).toBe(false)
    expect(options.signal).toBeInstanceOf(AbortSignal)

    await server.close()
  })

  it("skips waitForReady for the SDK path (health already verified by SDK)", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
    })

    const waitForReady = vi.fn(async () => true)
    const runtime = createRuntime({ waitForReady })
    await runtime.startAxCode()

    expect(waitForReady).not.toHaveBeenCalled()
  })

  it("never enables the legacy network-bind override", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://0.0.0.0:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
    })

    const runtime = createRuntime({
      env: {
        ENV_CONFIGURED_AX_CODE_PORT: 45678,
        ENV_CONFIGURED_AX_CODE_HOST: null,
        ENV_EFFECTIVE_PORT: 3001,
        ENV_CONFIGURED_AX_CODE_HOSTNAME: "0.0.0.0",
        ENV_SKIP_AX_CODE_START: false,
      },
    })
    const server = await runtime.startAxCode()
    const options = startHeadlessBackendMock.mock.calls[0][0]

    expect(options.allowNetworkBind).toBe(false)
    expect(options.env.AX_CODE_SERVER_PASSWORD).toBeUndefined()

    await server.close()
  })

  it("falls back to buildAugmentedPath when buildManagedAxCodePath is not provided", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: {},
      close: vi.fn(async () => undefined),
    })

    const runtime = createRuntime({
      buildManagedAxCodePath: undefined,
      buildAugmentedPath: vi.fn(() => "/home/user/.cargo/bin:/usr/local/bin"),
    })
    const server = await runtime.startAxCode()
    const options = startHeadlessBackendMock.mock.calls[0][0]

    expect(options.env.PATH).toBe("/home/user/.cargo/bin:/usr/local/bin")

    await server.close()
  })

  it("falls back to process.env.PATH when neither build function is provided", async () => {
    delete process.env.AX_CODE_BINARY
    process.env.PATH = "/usr/bin:/bin"
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: {},
      close: vi.fn(async () => undefined),
    })

    const runtime = createRuntime({
      buildManagedAxCodePath: undefined,
      buildAugmentedPath: undefined,
    })
    const server = await runtime.startAxCode()
    const options = startHeadlessBackendMock.mock.calls[0][0]

    expect(options.env.PATH).toBe("/usr/bin:/bin")

    await server.close()
  })

  it("uses SDK headless backend when the configured binary requires a wrapper", async () => {
    process.env.AX_CODE_BINARY = "/opt/ax-code/cli.js"
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
    })

    const runtime = createRuntime({
      resolveManagedAxCodeLaunchSpec: vi.fn(() => ({
        binary: "bun",
        args: ["/opt/ax-code/cli.js"],
        wrapperType: "bun",
      })),
    })
    const server = await runtime.startAxCode()
    const options = startHeadlessBackendMock.mock.calls[0][0]

    expect(spawnMock).not.toHaveBeenCalled()
    expect(options.binary).toBe("bun")
    expect(options.args).toEqual(["/opt/ax-code/cli.js", "serve", "--hostname", "127.0.0.1", "--port", "45678"])
    expect(options.env.PATH).toBe("/home/user/.local/bin:/usr/local/bin:/usr/bin")

    await server.close()
  })

  it("reports the binary when managed ax-code exits before becoming ready", async () => {
    process.env.AX_CODE_BINARY = "/opt/ax-code/cli.js"
    startHeadlessBackendMock.mockRejectedValue(
      new Error("ax-code backend exited before becoming ready (signal SIGTERM)"),
    )

    const runtime = createRuntime({
      resolveManagedAxCodeLaunchSpec: vi.fn(() => ({
        binary: "bun",
        args: ["/opt/ax-code/cli.js"],
        wrapperType: "bun",
      })),
    })

    await expect(runtime.startAxCode()).rejects.toThrow("ax-code backend exited before becoming ready (signal SIGTERM)")
    expect(spawnMock).not.toHaveBeenCalled()
    expect(startHeadlessBackendMock).toHaveBeenCalledTimes(2)
    expect(startHeadlessBackendMock.mock.calls[0][0].binary).toBe("bun")
    expect(startHeadlessBackendMock.mock.calls[0][0].args).toEqual([
      "/opt/ax-code/cli.js",
      "serve",
      "--hostname",
      "127.0.0.1",
      "--port",
      "45678",
    ])
  })

  it("does not spawn when the shutdown began before the first attempt", async () => {
    // `shutdown()` flags the teardown and aborts the controller an attempt creates for itself, and the retry
    // loop only checked the flag on its retry path. A shutdown that landed between the caller's bootstrap and
    // this first attempt therefore spawned a runtime nothing would close.
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValue({ close: vi.fn(async () => undefined) })

    const runtime = createRuntime()
    runtime.shutdown()

    await expect(runtime.startAxCode()).rejects.toThrow("shutting down")
    expect(startHeadlessBackendMock).not.toHaveBeenCalled()
  })

  it("does not retry startup after shutdown() aborts the in-progress SDK launch", async () => {
    delete process.env.AX_CODE_BINARY
    // Mirror the real SDK pattern: check signal.aborted after addEventListener so an
    // already-aborted signal (shutdown called before the mock runs) is handled correctly.
    startHeadlessBackendMock.mockImplementation(({ signal }) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new Error("startHeadlessBackend aborted"))
        signal?.addEventListener("abort", onAbort, { once: true })
        if (signal?.aborted) {
          onAbort()
        }
      })
    })

    const runtime = createRuntime()

    const startPromise = runtime.startAxCode()
    runtime.shutdown()

    await expect(startPromise).rejects.toThrow("startHeadlessBackend aborted")
    expect(startHeadlessBackendMock).toHaveBeenCalledTimes(1)
  })

  it("cancels an in-flight Windows legacy launch when shutdown aborts the signal", async () => {
    // The win32 branch called the legacy spawn helper without the abort signal it was handed, so a shutdown that
    // began while that spawn was pending left the child running with its port bound for the full 30s start
    // timeout. The SDK path observes the same signal, so the platform with the legacy launcher behaved worse.
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })
    delete process.env.AX_CODE_BINARY

    const child = new EventEmitter()
    child.pid = 4242
    child.exitCode = null
    child.signalCode = null
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = vi.fn((signalName) => {
      child.signalCode = signalName || "SIGTERM"
      child.emit("exit", null, child.signalCode)
      child.emit("close")
    })
    spawnMock.mockReturnValue(child)

    try {
      const runtime = createRuntime()
      const startPromise = runtime.startAxCode()
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), { timeout: 2000 })

      runtime.shutdown()

      await expect(startPromise).rejects.toThrow("AX Code launch was cancelled during shutdown")
      expect(child.kill).toHaveBeenCalled()
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  }, 3000)

  it("SDK handle has null exitCode/signalCode so isManagedAxCodeProcessAlive does not treat it as exited", async () => {
    delete process.env.AX_CODE_BINARY
    const { handle } = createLiveSdkHandle()
    startHeadlessBackendMock.mockResolvedValueOnce(handle)

    const runtime = createRuntime()
    const server = await runtime.startAxCode()

    expect(server).toBe(handle)
    expect(server.exitCode).toBe(null)
    expect(server.signalCode).toBe(null)

    await server.close()
  })

  it("does not retry managed startup when the configured ax-code binary is invalid", async () => {
    delete process.env.AX_CODE_BINARY
    const error = new Error("Configured ax-code binary not found: /missing/ax-code")
    error.code = "AX_CODE_BINARY_INVALID"
    const applyAxCodeBinaryFromSettings = vi.fn(async () => {
      throw error
    })

    const runtime = createRuntime({ applyAxCodeBinaryFromSettings })

    await expect(runtime.startAxCode()).rejects.toThrow("Configured ax-code binary not found: /missing/ax-code")
    expect(applyAxCodeBinaryFromSettings).toHaveBeenCalledTimes(1)
    expect(applyAxCodeBinaryFromSettings).toHaveBeenCalledWith({ strict: true })
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it("marks the SDK handle as exited once its closed promise resolves", async () => {
    delete process.env.AX_CODE_BINARY
    const diagnostics = {
      launchedAt: "2026-06-10T00:00:00.000Z",
      binary: "ax-code",
      args: ["serve"],
      hostname: "127.0.0.1",
      port: 45678,
      readyUrl: "http://127.0.0.1:45678",
      envKeys: ["PATH"],
    }
    const { handle, resolveClosed } = createLiveSdkHandle({ diagnostics, exit: { code: 1, signal: null } })
    startHeadlessBackendMock.mockResolvedValueOnce(handle)

    const runtime = createRuntime()
    const server = await runtime.startAxCode()

    expect(server).toBe(handle)
    expect(server.exitCode).toBe(null)
    resolveClosed()
    await new Promise((resolve) => setImmediate(resolve))
    expect(server.exitCode).toBe(1)
  })

  it("surfaces SDK launch diagnostics in lastAxCodeLaunchDiagnostics", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
      closed: new Promise(() => {}),
      diagnostics: {
        launchedAt: "2026-06-10T00:00:00.000Z",
        binary: "/opt/homebrew/bin/ax-code",
        args: ["serve", "--hostname", "127.0.0.1", "--port", "45678"],
        hostname: "127.0.0.1",
        port: 45678,
        readyUrl: "http://127.0.0.1:45678",
        health: { ok: true, status: 200 },
        envKeys: ["PATH", "HOME"],
        capturedOutput: "should not leak into state on success",
      },
    })

    const state = createLifecycleState()
    const runtime = createRuntime({ state })
    const server = await runtime.startAxCode()

    expect(state.lastAxCodeLaunchDiagnostics.sdk).toMatchObject({
      binary: "/opt/homebrew/bin/ax-code",
      readyUrl: "http://127.0.0.1:45678",
      health: { ok: true, status: 200, error: null },
      envKeyCount: 2,
    })
    expect(state.lastAxCodeLaunchDiagnostics.sdk.capturedOutput).toBeUndefined()

    await server.close()
  })

  it("retries managed ax-code startup once after a pre-ready exit", async () => {
    process.env.AX_CODE_BINARY = "/opt/ax-code/cli.js"
    startHeadlessBackendMock.mockRejectedValueOnce(
      new Error("ax-code backend exited before becoming ready (signal SIGTERM)"),
    )
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
    })

    const runtime = createRuntime({
      resolveManagedAxCodeLaunchSpec: vi.fn(() => ({
        binary: "bun",
        args: ["/opt/ax-code/cli.js"],
        wrapperType: "bun",
      })),
    })
    const server = await runtime.startAxCode()

    expect(spawnMock).not.toHaveBeenCalled()
    expect(startHeadlessBackendMock).toHaveBeenCalledTimes(2)
    await server.close()
  })

  it("retries a failed bootstrap with backoff instead of wedging permanently", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockRejectedValueOnce(new Error("spawn failed (attempt 1)"))
    startHeadlessBackendMock.mockRejectedValueOnce(new Error("spawn failed (attempt 2)"))
    startHeadlessBackendMock.mockResolvedValue({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
      closed: new Promise(() => {}),
    })

    const state = createLifecycleState()
    const runtime = createRuntime({ state })

    await runtime.bootstrapAxCodeAtStartup()

    expect(state.lastAxCodeError).toBe("spawn failed (attempt 2)")
    expect(state.axCodeProcess).toBe(null)
    expect(state.axCodeRetryExhausted).toBe(false)
    expect(state.axCodeNextRetryAt).toBeGreaterThan(0)

    // The first scheduled retry (50ms base delay in tests) recovers the backend.
    await vi.waitFor(() => {
      expect(state.axCodeProcess).toBeTruthy()
      expect(state.isAxCodeReady).toBe(true)
    })

    expect(state.axCodeNextRetryAt).toBe(0)
    expect(state.axCodeRetryExhausted).toBe(false)
    // Health monitoring was started by the successful retry.
    expect(state.healthCheckInterval).toBeTruthy()

    runtime.shutdown()
    expect(state.healthCheckInterval).toBe(null)
  })

  it("keeps retrying when the restart triggered by a health failure cannot start", async () => {
    delete process.env.AX_CODE_BINARY
    const live = createLiveSdkHandle()
    startHeadlessBackendMock.mockResolvedValueOnce(live.handle)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, body: { cancel: vi.fn(async () => undefined) }, json: async () => ({}) })),
    )

    try {
      const state = createLifecycleState()
      const runtime = createRuntime({ state })

      await runtime.bootstrapAxCodeAtStartup()
      expect(state.axCodeProcess).toBeTruthy()

      // The managed process exits, the health check sees it gone, and the restart it
      // triggers cannot spawn a replacement.
      live.resolveClosed()
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("connection refused")
        }),
      )
      startHeadlessBackendMock.mockRejectedValueOnce(new Error("spawn failed after crash"))

      await runtime.triggerHealthCheck()

      // Regression: the failed restart cleared the process handle, and every
      // health-check entry point requires one, so nothing retried and the UI stayed on
      // 503 {restarting:true} until a settings refresh or an app restart.
      expect(state.axCodeProcess).toBe(null)
      expect(state.axCodeNextRetryAt).toBeGreaterThan(0)

      // The scheduled retry (50ms base delay in tests) brings the backend back.
      startHeadlessBackendMock.mockResolvedValue({
        url: "http://127.0.0.1:45678",
        headers: { Authorization: "Basic test" },
        close: vi.fn(async () => undefined),
        closed: new Promise(() => {}),
      })
      await vi.waitFor(() => {
        expect(state.axCodeProcess).toBeTruthy()
      })
      expect(state.axCodeNextRetryAt).toBe(0)

      runtime.shutdown()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("reports the runtime origin when a managed start assigns the port (S2.4a)", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValueOnce({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
    })

    const onRuntimeOriginChange = vi.fn()
    const runtime = createRuntime({ onRuntimeOriginChange })
    const server = await runtime.startAxCode()

    expect(onRuntimeOriginChange).toHaveBeenCalledWith("http://127.0.0.1:45678", { exhausted: false })

    await server.close()
  })

  it("reports a null origin when a managed start fails (S2.4a)", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockRejectedValue(new Error("spawn failed"))

    const onRuntimeOriginChange = vi.fn()
    const state = createLifecycleState()
    state.axCodePort = 45678
    const runtime = createRuntime({ state, onRuntimeOriginChange })

    await expect(runtime.startAxCode()).rejects.toThrow("spawn failed")

    expect(state.axCodePort).toBe(null)
    expect(onRuntimeOriginChange).toHaveBeenCalledWith(null, { exhausted: false })
  })

  it("dedupes repeat reports and forces one initial report after bootstrap (S2.4a)", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockResolvedValue({
      url: "http://127.0.0.1:45678",
      headers: { Authorization: "Basic test" },
      close: vi.fn(async () => undefined),
      closed: new Promise(() => {}),
    })
    // waitForAxCodeReady polls /config and /agent after the port is assigned;
    // answer those probes so the success-path bootstrap completes.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, body: { cancel: vi.fn(async () => undefined) }, json: async () => ({}) })),
    )

    try {
      const onRuntimeOriginChange = vi.fn()
      const state = createLifecycleState()
      const runtime = createRuntime({ state, onRuntimeOriginChange })

      await runtime.bootstrapAxCodeAtStartup()

      // Exactly one report for the assigned origin, plus the forced initial
      // report after bootstrap — deduped, so the same origin is not re-sent.
      const originCalls = onRuntimeOriginChange.mock.calls.filter(([origin]) => origin === "http://127.0.0.1:45678")
      expect(originCalls.length).toBe(1)
      expect(onRuntimeOriginChange.mock.calls.at(-1)).toEqual(["http://127.0.0.1:45678", { exhausted: false }])

      runtime.shutdown()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("reports a null origin after a failed bootstrap (S2.4a)", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockRejectedValue(new Error("spawn failed"))

    const onRuntimeOriginChange = vi.fn()
    const state = createLifecycleState()
    const runtime = createRuntime({ state, onRuntimeOriginChange })

    await runtime.bootstrapAxCodeAtStartup()

    expect(onRuntimeOriginChange).toHaveBeenCalledWith(null, { exhausted: false })
    expect(onRuntimeOriginChange.mock.calls.at(-1)).toEqual([null, { exhausted: false }])

    runtime.shutdown()
  })

  it("does not spawn again when shutdown begins inside the retry delay", async () => {
    // The retry loop checked `isShuttingDown` before the delay and not after it. A shutdown that ran inside the
    // delay had already run the ax-code teardown (which found no process to close), so the next attempt spawned
    // a child nothing closes: the process outlives the app with its port bound.
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockReset()
    startHeadlessBackendMock.mockRejectedValueOnce(new Error("spawn failed"))
    startHeadlessBackendMock.mockResolvedValue({ close: vi.fn() })

    const state = createLifecycleState()
    const runtime = createRuntime({ state })

    try {
      const startup = runtime.bootstrapAxCodeAtStartup()
      await vi.waitFor(() => expect(startHeadlessBackendMock).toHaveBeenCalledTimes(1), { timeout: 5000 })

      runtime.shutdown()
      await startup.catch(() => {})

      expect(startHeadlessBackendMock).toHaveBeenCalledTimes(1)
    } finally {
      runtime.shutdown()
      startHeadlessBackendMock.mockReset()
    }
  }, 20000)

  it("kills only a listener on the port, not a client that merely uses it", () => {
    // `lsof -ti :PORT` matches every process whose local or remote port is PORT, so a client connected to the
    // runtime — or an unrelated app whose source port happens to be that number — was killed with it. The
    // sibling helper in `core-routes.js` filters on LISTEN for exactly this reason.
    //
    // The platform is pinned rather than skipped: the helper returns before it spawns anything on win32, so on
    // a Windows runner the assertion would read an empty call list and fail for a reason unrelated to the bug.
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")
    Object.defineProperty(process, "platform", { value: "linux", configurable: true })
    const runtime = createRuntime()
    spawnSyncMock.mockReset()
    spawnSyncMock.mockReturnValue({ stdout: "", stderr: "" })

    try {
      runtime.killProcessOnPort(45678)

      const lsofArgs = spawnSyncMock.mock.calls.find(([command]) => command === "lsof")?.[1] ?? []
      expect(lsofArgs).toEqual(["-nP", "-t", "-iTCP:45678", "-sTCP:LISTEN"])
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })

  it("reports exhausted:true once the bootstrap retry budget is spent (S2.4a)", async () => {
    delete process.env.AX_CODE_BINARY
    startHeadlessBackendMock.mockRejectedValue(new Error("spawn failed"))

    const onRuntimeOriginChange = vi.fn()
    const state = createLifecycleState()
    const runtime = createRuntime({ state, onRuntimeOriginChange })

    await runtime.bootstrapAxCodeAtStartup()

    // Retries run on short test delays (50ms/100ms), but each failed restart
    // attempt takes ~750ms; the budget exhausts after
    // BOOTSTRAP_RETRY_MAX_ATTEMPTS (10) failed attempts.
    await vi.waitFor(
      () => {
        expect(state.axCodeRetryExhausted).toBe(true)
      },
      { timeout: 20000 },
    )

    // Main's protocol handler mirrors the readiness gate: while retrying the
    // reports carry exhausted:false; the terminal report flips it so the 503
    // payload becomes {restarting:false} instead of spinning forever.
    expect(onRuntimeOriginChange).toHaveBeenCalledWith(null, { exhausted: false })
    expect(onRuntimeOriginChange.mock.calls.at(-1)).toEqual([null, { exhausted: true }])

    // A second boot in the same process - an in-process restart reuses this runtime -
    // gets its own budget. The counters used to survive it, so the new boot reported
    // the terminal failure without arming a single retry.
    await runtime.bootstrapAxCodeAtStartup()

    expect(state.axCodeRetryExhausted).toBe(false)
    expect(state.axCodeNextRetryAt).toBeGreaterThan(0)

    runtime.shutdown()
  }, 30000)

  it("never managed-spawns when an external origin is configured but not yet healthy (S2.5b)", async () => {
    delete process.env.AX_CODE_BINARY
    // The external runtime (supervised by Electron main in desktop mode) is
    // still booting: every probe fails with connection refused.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED")
      }),
    )

    try {
      const onRuntimeOriginChange = vi.fn()
      const state = createLifecycleState()
      const runtime = createRuntime({
        state,
        onRuntimeOriginChange,
        env: {
          ENV_CONFIGURED_AX_CODE_PORT: 45678,
          ENV_CONFIGURED_AX_CODE_HOST: { origin: "http://127.0.0.1:45678", port: 45678 },
          ENV_EFFECTIVE_PORT: 45678,
          ENV_CONFIGURED_AX_CODE_HOSTNAME: "127.0.0.1",
          ENV_SKIP_AX_CODE_START: false,
        },
      })

      await runtime.bootstrapAxCodeAtStartup()

      // The double-spawn invariant: with AX_CODE_HOST configured, a failed
      // external probe must NOT fall back to a managed spawn — main's
      // supervisor would be fighting a second runtime for the same port.
      expect(startHeadlessBackendMock).not.toHaveBeenCalled()
      expect(spawnMock).not.toHaveBeenCalled()
      expect(state.isExternalAxCode).toBe(true)
      expect(state.isAxCodeReady).toBe(false)
      // The port stays unset so the reported origin is null ("restarting")
      // until a probe actually succeeds.
      expect(state.axCodePort).toBe(null)
      expect(onRuntimeOriginChange.mock.calls.at(-1)).toEqual([null, { exhausted: false }])
      // Recovery is a scheduled re-probe, not a crash and not a wedge.
      expect(state.axCodeNextRetryAt).toBeGreaterThan(0)
      expect(state.axCodeRetryExhausted).toBe(false)

      // Once the external runtime answers healthy, the scheduled retry
      // adopts it — still without any managed spawn.
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          body: { cancel: vi.fn(async () => undefined) },
          json: async () => ({ healthy: true, version: "7.9.13" }),
        })),
      )
      await vi.waitFor(() => {
        expect(state.isAxCodeReady).toBe(true)
      })
      expect(state.axCodePort).toBe(45678)
      expect(startHeadlessBackendMock).not.toHaveBeenCalled()
      expect(spawnMock).not.toHaveBeenCalled()
      expect(onRuntimeOriginChange.mock.calls.at(-1)).toEqual(["http://127.0.0.1:45678", { exhausted: false }])

      runtime.shutdown()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("asks main to restart the runtime on a config change when external and main-supervised (S2.5c)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: { cancel: vi.fn(async () => undefined) },
        json: async () => ({ healthy: true }),
      })),
    )

    try {
      const requestMainRuntimeRestart = vi.fn()
      const state = createLifecycleState()
      state.isExternalAxCode = true
      state.axCodePort = 45678
      state.axCodeBaseUrl = "http://127.0.0.1:45678"
      const runtime = createRuntime({ state, requestMainRuntimeRestart })

      await runtime.refreshAxCodeAfterConfigChange("settings saved")

      // The restart request goes to main alongside the local re-probe: only
      // main can make a settings.axCodeBinary change take effect.
      expect(requestMainRuntimeRestart).toHaveBeenCalledWith("settings saved")
      expect(state.isAxCodeReady).toBe(true)

      runtime.shutdown()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("does not request a main restart when the dependency is absent (standalone web mode)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: { cancel: vi.fn(async () => undefined) },
        json: async () => ({ healthy: true }),
      })),
    )

    try {
      const state = createLifecycleState()
      state.isExternalAxCode = true
      state.axCodePort = 45678
      state.axCodeBaseUrl = "http://127.0.0.1:45678"
      // No requestMainRuntimeRestart passed: the refresh must still work.
      const runtime = createRuntime({ state })

      await runtime.refreshAxCodeAfterConfigChange("settings saved")
      expect(state.isAxCodeReady).toBe(true)

      runtime.shutdown()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
