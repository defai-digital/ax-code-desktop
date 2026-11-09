import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const { buildWindowsCommandLine, runOpenSpecChain } = createRequire(import.meta.url)("./open-app-launcher.js")

describe("asynchronous app launching", () => {
  test("serves timers while an actual launcher process is still running", async () => {
    let finished = false
    const pending = runOpenSpecChain(
      [{ program: process.execPath, args: ["-e", "setTimeout(() => {}, 100)"] }],
      "Test launcher",
    ).then(() => {
      finished = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(finished).toBe(false)
    await pending
    expect(finished).toBe(true)
  })

  test("leaves the event loop available while waiting for the launcher", async () => {
    const child = new EventEmitter()
    const spawn = vi.fn(() => child)
    let finished = false
    const pending = runOpenSpecChain([{ program: "open", args: ["a path with spaces"] }], "Editor", spawn).then(() => {
      finished = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(finished).toBe(false)
    expect(spawn).toHaveBeenCalledWith("open", ["a path with spaces"], { stdio: "ignore", windowsHide: true })
    child.emit("close", 0)
    await pending
    expect(finished).toBe(true)
  })

  test("treats a launcher that never exits as launched instead of waiting forever", async () => {
    // A candidate that is the app itself (or a shim that hangs) never closes, and the IPC call that asked
    // never returned. The child is not killed: it may be the app the user asked for.
    const child = Object.assign(new EventEmitter(), { unref: vi.fn(), kill: vi.fn() })
    const spawn = vi.fn(() => child)

    await runOpenSpecChain([{ program: "editor", args: [] }, { program: "unused", args: [] }], "Editor", spawn, {
      settleTimeoutMs: 20,
    })

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(child.unref).toHaveBeenCalled()
    expect(child.kill).not.toHaveBeenCalled()
  })

  test("tries fallbacks after spawn errors and nonzero exits, stopping at success", async () => {
    const spawn = vi.fn((program) => {
      const child = new EventEmitter()
      queueMicrotask(() => {
        if (program === "missing") child.emit("error", new Error("ENOENT"))
        else child.emit("close", program === "failed" ? 1 : 0)
      })
      return child
    })
    await runOpenSpecChain(
      ["missing", "failed", "open", "unused"].map((program) => ({ program, args: [] })),
      "Editor",
      spawn,
    )
    expect(spawn).toHaveBeenCalledTimes(3)
    await expect(runOpenSpecChain([{ program: "failed", args: [] }], "Editor", spawn)).rejects.toThrow(
      "failed exited 1",
    )
    await expect(runOpenSpecChain([], "Editor", spawn)).rejects.toThrow("no launch candidates")
  })
})

describe("Windows command lines", () => {
  test("keeps paths cmd would rewrite out of the command line", () => {
    // Quoting does not stop cmd from expanding `%USERNAME%` or `call` from doubling `^`, so the editor opened
    // a different folder than the one the user picked. The values travel in the environment instead.
    const values = ["C:\\Program Files\\Code\\bin\\code.cmd", "C:\\work\\%USERNAME%", "C:\\src\\a^b & c"]

    const { commandLine, env } = buildWindowsCommandLine(["start", '""'], values, { PATH: "C:\\Windows" })

    expect(commandLine).toBe('start "" "%AX_CODE_LAUNCH_ARG_0%" "%AX_CODE_LAUNCH_ARG_1%" "%AX_CODE_LAUNCH_ARG_2%"')
    expect(commandLine).not.toContain("call")
    for (const value of values) expect(commandLine).not.toContain(value)
    expect(env).toEqual({
      PATH: "C:\\Windows",
      AX_CODE_LAUNCH_ARG_0: values[0],
      AX_CODE_LAUNCH_ARG_1: values[1],
      AX_CODE_LAUNCH_ARG_2: values[2],
    })
  })
})
