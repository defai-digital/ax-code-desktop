import { randomBytes } from "node:crypto"
import { EXIT, evaluateReport } from "./webmcp-check-lib.mjs"
import { createRequire, Module } from "node:module"
import { EventEmitter } from "node:events"
import { afterEach, expect, test, vi } from "vitest"

import { credentialTextCases, fieldContextCases, secret } from "../../../shared/testing/webmcp-redaction-cases.mjs"

const require = createRequire(import.meta.url)
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  delete require.cache[require.resolve("./webmcp-check-entry.cjs")]
})

test("the actual Electron entry redacts every disk write without altering the invoked input", async () => {
  vi.useFakeTimers()
  const writes = []
  const receiptKey = randomBytes(32).toString("hex")
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler() {},
    session: Object.assign(new EventEmitter(), {
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
    }),
    loadURL: async () => {},
    getURL: () => "https://example.com",
    debugger: Object.assign(new EventEmitter(), { attach() {}, sendCommand: async () => {} }),
    executeJavaScript: vi.fn(),
  })
  contents.debugger.sendCommand = async (method) => {
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top" } } }
    if (method === "WebMCP.enable")
      contents.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [{ name: "echo", frameId: "top" }] })
  }
  const inputs = []
  const context = {
    getTools: async () => [{ name: "echo" }],
    executeTool: async (_tool, input) => {
      inputs.push(JSON.parse(input))
      if (inputs.length === 2) throw new Error(JSON.stringify({ password: "thrown-secret" }))
      if (inputs.length === 3) return { errors: [...credentialTextCases, ...fieldContextCases.map(({ input }) => ({ error: input }))] }
      if (inputs.length === 4) throw new Error(credentialTextCases.join("\n"))
      return JSON.stringify({ access_token: "returned-secret", nested: [{ apiKey: "nested-secret" }], value: "kept" })
    },
  }
  contents.executeJavaScript.mockImplementation((program) =>
    new Function("document", `return ${program}`)({ modelContext: context }),
  )
  const exit = vi.fn()
  const electron = {
    app: { commandLine: { appendSwitch() {} }, setPath() {}, whenReady: async () => {}, exit },
    BrowserWindow: class {
      webContents = contents
      destroy() {}
    },
  }
  const load = Module._load
  vi.spyOn(Module, "_load").mockImplementation(function (name, ...args) {
    if (name === "electron") return electron
    if (name === "node:fs") return { writeFileSync: (_path, text) => writes.push(text) }
    return load.call(this, name, ...args)
  })
  vi.stubEnv(
    "AX_WEBMCP_CHECK",
    JSON.stringify({
      url: "https://example.com",
      profile: "/unused/profile",
      output: "/unused/report",
      receiptKey,
      settleMs: 0,
      timeoutMs: 1000,
      runs: [
        { name: "echo", input: { password: "input-secret" } },
        { name: "echo", input: {} },
        { name: "echo", input: { messages: credentialTextCases } },
        { name: "echo", input: {} },
      ],
    }),
  )
  require("./webmcp-check-entry.cjs")
  await vi.runAllTimersAsync()
  expect(exit).toHaveBeenCalledWith(0)
  expect(inputs).toEqual([{ password: "input-secret" }, {}, { messages: credentialTextCases }, {}])
  expect(writes.length).toBeGreaterThan(2)
  for (const text of writes) {
    for (const secret of ["input-secret", "returned-secret", "nested-secret", "thrown-secret", "AUDIT_FAKE_PASSWORD"])
      expect(text).not.toContain(secret)
  }
  const report = JSON.parse(writes.at(-1))
  const evaluateFirst = (password) => evaluateReport(
    { tools: report.tools, runs: [report.runs[0]] },
    { expectTools: [], runs: [{ name: "echo", input: { password } }] },
    undefined,
    receiptKey,
  )
  expect(evaluateFirst("input-secret").exitCode).toBe(EXIT.ok)
  expect(evaluateFirst("different-secret").exitCode).toBe(EXIT.failed)
  expect(JSON.stringify(evaluateFirst("input-secret"))).not.toContain("inputReceipt")
  for (const text of writes) expect(text).not.toContain(receiptKey)
  expect(report.runs[0].input).toEqual({ password: "[redacted]" })
  expect(JSON.parse(report.runs[0].output)).toMatchObject({ access_token: "[redacted]", value: "kept" })
  expect(report.runs[1].error).not.toContain("thrown-secret")
  expect(JSON.stringify(report)).not.toContain(secret)
})

function startCatalogCheck(onEnable, runs = []) {
  vi.useFakeTimers()
  const writes = []
  const exit = vi.fn()
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler() {},
    session: Object.assign(new EventEmitter(), {
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
    }),
    executeJavaScript: vi.fn(() => new Promise(() => {})),
    loadURL: async () => {},
    getURL: () => "https://example.com",
    debugger: Object.assign(new EventEmitter(), { attach() {} }),
  })
  const emit = (method, tools) => contents.debugger.emit("message", {}, method, { tools })
  contents.debugger.sendCommand = async (method) => {
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top" } } }
    if (method === "WebMCP.enable") onEnable(emit, contents.debugger)
  }
  const load = Module._load
  vi.spyOn(Module, "_load").mockImplementation(function (name, ...args) {
    if (name === "electron")
      return {
        app: { commandLine: { appendSwitch() {} }, setPath() {}, whenReady: async () => {}, exit },
        BrowserWindow: class {
          webContents = contents
          destroy() {}
        },
      }
    if (name === "node:fs") return { writeFileSync: (_path, text) => writes.push(JSON.parse(text)) }
    return load.call(this, name, ...args)
  })
  vi.stubEnv(
    "AX_WEBMCP_CHECK",
    JSON.stringify({
      url: "https://example.com",
      profile: "/unused/profile",
      output: "/unused/report",
      receiptKey: "catalog-test-key",
      settleMs: 3000,
      timeoutMs: 5000,
      runs,
    }),
  )
  require("./webmcp-check-entry.cjs")
  return { exit, contents, report: () => writes.at(-1) }
}

test("checker readiness only includes top-level registrations, even with colliding iframe names", async () => {
  const { report } = startCatalogCheck((emit) => {
    emit("WebMCP.toolsAdded", [{ name: "echo", description: "Top-level", frameId: "top" }])
    emit("WebMCP.toolsAdded", [
      { name: "iframe_only", frameId: "child" },
      { name: "echo", description: "Iframe", frameId: "child" },
    ])
    emit("WebMCP.toolsRemoved", [{ name: "echo", frameId: "child" }])
  })
  await vi.runAllTimersAsync()
  expect(report().tools).toMatchObject([{ name: "echo", description: "Top-level" }])
  expect(evaluateReport(report(), { expectTools: ["iframe_only"], runs: [] }).exitCode).toBe(EXIT.failed)
  expect(evaluateReport(report(), { expectTools: ["echo"], runs: [] }).exitCode).toBe(EXIT.ok)
})

test.each([
  { description: "Changed description" },
  { inputSchema: { type: "object", properties: { count: { type: "number" } } } },
  { annotations: { readOnlyHint: true } },
  { backendNodeId: 23 },
])("checker restarts settling when an existing definition changes: %j", async (change) => {
  const initial = { name: "echo", frameId: "top", description: "Original", inputSchema: { type: "object" } }
  const { exit, report } = startCatalogCheck((emit) => {
    emit("WebMCP.toolsAdded", [initial])
    setTimeout(() => emit("WebMCP.toolsAdded", [{ ...initial, ...change }]), 600)
  })
  await vi.advanceTimersByTimeAsync(1000)
  expect(exit).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  expect(exit).toHaveBeenCalledWith(0)
  expect(report().tools[0]).toMatchObject({
    description: change.description ?? initial.description,
    inputSchema: change.inputSchema ?? initial.inputSchema,
    annotations: change.annotations ?? {},
    form: change.backendNodeId !== undefined,
  })
})

test("definition churn between polling ticks restarts settling even if it returns to the original", async () => {
  const initial = { name: "echo", frameId: "top", description: "Original" }
  const { exit } = startCatalogCheck((emit) => {
    emit("WebMCP.toolsAdded", [initial])
    setTimeout(() => {
      emit("WebMCP.toolsRemoved", [initial])
      emit("WebMCP.toolsAdded", [initial])
    }, 600)
  })
  await vi.advanceTimersByTimeAsync(1000)
  expect(exit).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  expect(exit).toHaveBeenCalledWith(0)
})

test("identical definitions and iframe changes do not extend the top-level quiet period", async () => {
  const initial = { name: "echo", frameId: "top", description: "Original" }
  const { exit } = startCatalogCheck((emit) => {
    emit("WebMCP.toolsAdded", [initial])
    setTimeout(() => {
      emit("WebMCP.toolsAdded", [{ description: "Original", frameId: "top", name: "echo" }])
      emit("WebMCP.toolsAdded", [{ name: "child", frameId: "child", description: "Changed" }])
    }, 600)
  })
  await vi.advanceTimersByTimeAsync(750)
  expect(exit).toHaveBeenCalledWith(0)
})


test("catalog receipts distinguish redacted tool names in actual disk reports", async () => {
  const actual = "ghp_BBBBBBBBBBBBBBBB"
  const missing = "ghp_AAAAAAAAAAAAAAAA"
  const { report } = startCatalogCheck((emit) => {
    emit("WebMCP.toolsAdded", [{ name: actual, frameId: "top" }])
  })
  await vi.runAllTimersAsync()
  expect(report().tools[0].name).toBe("[redacted]")
  const evaluate = (name) => evaluateReport(report(), { expectTools: [name], runs: [] }, undefined, "catalog-test-key")
  expect(evaluate(actual).exitCode).toBe(EXIT.ok)
  expect(evaluate(missing).exitCode).toBe(EXIT.failed)
  expect(JSON.stringify(evaluate(missing))).not.toContain(missing)
})

test("an unconfirmed timeout contaminates remaining runs without invoking them", async () => {
  const runs = [{ name: "slow", input: {} }, { name: "read", input: {} }, { name: "later", input: {} }]
  const { report, contents } = startCatalogCheck((emit) => emit("WebMCP.toolsAdded", [{ name: "slow", frameId: "top" }]), runs)
  await vi.runAllTimersAsync()
  expect(contents.executeJavaScript).toHaveBeenCalledTimes(1)
  expect(report().runs).toHaveLength(3)
  expect(report().runs[0].timedOut).toBe(true)
  expect(report().runs.slice(1).every((run) => run.notRun && run.error.includes("contaminated"))).toBe(true)
  expect(evaluateReport(report(), { expectTools: [], runs }, undefined, "catalog-test-key").exitCode).toBe(EXIT.toolError)
})
