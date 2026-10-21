import { createRequire, Module } from "node:module"
import { EventEmitter } from "node:events"
import { afterEach, expect, test, vi } from "vitest"

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
  const inputs = []
  const context = {
    getTools: async () => [{ name: "echo" }],
    executeTool: async (_tool, input) => {
      inputs.push(JSON.parse(input))
      if (inputs.length === 2) throw new Error("password=thrown-secret")
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
      settleMs: 0,
      timeoutMs: 1000,
      runs: [
        { name: "echo", input: { password: "input-secret" } },
        { name: "echo", input: {} },
      ],
    }),
  )
  require("./webmcp-check-entry.cjs")
  await vi.runAllTimersAsync()
  expect(exit).toHaveBeenCalledWith(0)
  expect(inputs).toEqual([{ password: "input-secret" }, {}])
  expect(writes.length).toBeGreaterThan(2)
  for (const text of writes) {
    for (const secret of ["input-secret", "returned-secret", "nested-secret", "thrown-secret"])
      expect(text).not.toContain(secret)
  }
  const report = JSON.parse(writes.at(-1))
  expect(report.runs[0].input).toEqual({ password: "[redacted]" })
  expect(JSON.parse(report.runs[0].output)).toMatchObject({ access_token: "[redacted]", value: "kept" })
  expect(report.runs[1].error).toBe("[redacted]")
})
