import { runInputReceipt, toolIdentityReceipt } from "./webmcp-check-receipt.cjs"
import { redactWebMcpReport } from "../../../shared/webmcp-redaction.mjs"
import { EventEmitter } from "node:events"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), read: vi.fn(), remove: vi.fn() }))
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }))
vi.mock("node:fs", () => ({
  default: { mkdtempSync: () => "/tmp/check-fixture", readFileSync: mocks.read, rmSync: mocks.remove },
}))
vi.mock("node:module", async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    createRequire: (url) => {
      const require = original.createRequire(url)
      return (name) => (name === "electron" ? "/fixture/electron" : require(name))
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test.each([
  [137, null, false, false],
  [137, null, false, true],
  [null, "SIGTERM", false, false],
  [null, "SIGTERM", false, true],
  [0, null, true, false],
  [0, null, true, true],
  [0, null, false, false],
  [0, null, false, true],
])("launcher evaluates exit=%s signal=%s watchdog=%s complete=%s", async (code, signal, timedOut, complete) => {
  vi.resetModules()
  vi.useFakeTimers()
  const child = new EventEmitter()
  child.pid = 123456
  const killGroup = vi.spyOn(process, "kill").mockImplementation(() => { child.emit("exit", code, signal); return true })
  child.kill = vi.fn(() => child.emit("exit", code, signal))
  mocks.spawn.mockReturnValue(child)
  mocks.read.mockImplementation(() => {
    const config = JSON.parse(mocks.spawn.mock.calls.at(-1)[2].env.AX_WEBMCP_CHECK)
    const report = {
      tools: [{ name: "echo" }],
      runs: complete ? [{ name: "echo", input: {}, output: "{}" }] : [],
    }
    report.tools = report.tools.map((tool) => ({ ...tool, identityReceipt: toolIdentityReceipt(config.receiptKey, tool.name) }))
    report.runs = report.runs.map((run, index) => ({ ...run, inputReceipt: runInputReceipt(config.receiptKey, index, run) }))
    return JSON.stringify(redactWebMcpReport(report))
  })
  vi.spyOn(process, "argv", "get").mockReturnValue([
    "node",
    "check",
    "--url",
    "https://example.com",
    "--expect-tools",
    "echo",
    "--run",
    "echo",
    "--json",
  ])
  const log = vi.spyOn(console, "log").mockImplementation(() => {})
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("fixture exit")
  })
  const done = expect(import("./webmcp-check.mjs")).rejects.toThrow("fixture exit")
  await vi.waitFor(() => expect(child.listenerCount("exit")).toBe(1))
  if (timedOut) await vi.runAllTimersAsync()
  else child.emit("exit", code, signal)
  await done
  if (timedOut && process.platform !== "win32") {
    expect(killGroup).toHaveBeenCalledWith(-child.pid, "SIGKILL")
    expect(mocks.spawn.mock.calls.at(-1)[2].detached).toBe(true)
  }
  const result = JSON.parse(log.mock.calls.at(-1)[0])
  const success = complete && code === 0 && !signal && !timedOut
  expect(exit).toHaveBeenCalledWith(success ? 0 : 1)
  expect(result.exitCode).toBe(success ? 0 : 1)
  if (success) expect(result.problems).toEqual([])
  else expect(result.problems.length).toBeGreaterThan(0)
  expect(mocks.remove).toHaveBeenCalled()
})

test.each([false, true])("launcher filters runs and problems (json: %s)", async (json) => {
  vi.resetModules()
  const child = new EventEmitter()
  mocks.spawn.mockReturnValue(child)
  mocks.read.mockImplementation(() => {
    const config = JSON.parse(mocks.spawn.mock.calls.at(-1)[2].env.AX_WEBMCP_CHECK)
    const report = {
      tools: [{ name: "echo", description: "password=catalog-secret" }],
      runs: [
        { name: "echo", input: { password: "input-secret" }, output: '{"access_token":"output-secret","ok":true}' },
        { name: "echo", input: {}, error: "Error: password=error-secret" },
      ],
    }
    report.tools = report.tools.map((tool) => ({ ...tool, identityReceipt: toolIdentityReceipt(config.receiptKey, tool.name) }))
    report.runs = report.runs.map((run, index) => ({ ...run, inputReceipt: runInputReceipt(config.receiptKey, index, run) }))
    return JSON.stringify(redactWebMcpReport(report))
  })
  vi.spyOn(process, "argv", "get").mockReturnValue([
    "node",
    "check",
    "--url",
    "https://example.com",
    "--run",
    'echo={"password":"input-secret"}',
    "--run",
    "echo",
    ...(json ? ["--json"] : []),
  ])
  const log = vi.spyOn(console, "log").mockImplementation(() => {})
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("fixture exit")
  })
  const done = expect(import("./webmcp-check.mjs")).rejects.toThrow("fixture exit")
  await vi.waitFor(() => expect(child.listenerCount("exit")).toBe(1))
  child.emit("exit", 0, null)
  await done
  const printed = JSON.stringify([...log.mock.calls, ...error.mock.calls])
  for (const secret of ["input-secret", "output-secret", "error-secret", "catalog-secret"])
    expect(printed).not.toContain(secret)
  expect(exit).toHaveBeenCalledWith(3)
  if (json) {
    const result = JSON.parse(log.mock.calls.at(-1)[0])
    expect(result.runs[0].outcome).toBe("completed")
    expect(result.runs[1].outcome).toBe("failed")
    expect(result.problems).toHaveLength(1)
  }
})
