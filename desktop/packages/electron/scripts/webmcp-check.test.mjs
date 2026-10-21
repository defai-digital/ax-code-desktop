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
  child.kill = vi.fn(() => child.emit("exit", code, signal))
  mocks.spawn.mockReturnValue(child)
  mocks.read.mockReturnValue(
    JSON.stringify({
      tools: [{ name: "echo" }],
      runs: complete ? [{ name: "echo", input: {}, output: "{}" }] : [],
    }),
  )
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
  const result = JSON.parse(log.mock.calls.at(-1)[0])
  const success = complete && code === 0 && !signal && !timedOut
  expect(exit).toHaveBeenCalledWith(success ? 0 : 1)
  expect(result.exitCode).toBe(success ? 0 : 1)
  if (success) expect(result.problems).toEqual([])
  else expect(result.problems.length).toBeGreaterThan(0)
  expect(mocks.remove).toHaveBeenCalled()
})
