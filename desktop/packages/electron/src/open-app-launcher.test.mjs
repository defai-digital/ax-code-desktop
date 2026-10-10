import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const { runOpenSpecChain } = createRequire(import.meta.url)("./open-app-launcher.js")

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
