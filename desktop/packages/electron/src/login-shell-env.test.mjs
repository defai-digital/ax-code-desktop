import { describe, expect, test } from "vitest"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  LOGIN_SHELL_ENV_UNAVAILABLE,
  LOGIN_SHELL_ENV_VAR,
  MAX_FORWARDED_BYTES,
  encodeLoginShellEnv,
  resolveForwardedLoginShellEnv,
  startLoginShellEnvCapture,
} = require("./login-shell-env.js")

function fakeExecFile(outputs) {
  const calls = []
  const execFile = (file, args, options, callback) => {
    calls.push({ file, args, options })
    const next = outputs.shift()
    const child = {
      killed: [],
      kill(signal) {
        this.killed.push(signal)
      },
    }
    if (next !== "hang") queueMicrotask(() => (next instanceof Error ? callback(next) : callback(null, next)))
    return child
  }
  return { execFile, calls }
}

describe("login shell env capture", () => {
  test("uses the same login-shell command and candidate order as the web server", async () => {
    const { execFile, calls } = fakeExecFile([new Error("boom"), "PATH=/a\0HOME=/h\0"])
    const capture = startLoginShellEnvCapture({
      platform: "darwin",
      env: { SHELL: "/custom/zsh" },
      execFile,
      isExecutable: () => true,
      timeoutMs: 1500,
    })
    await expect(capture.promise).resolves.toBe("PATH=/a\0HOME=/h\0")
    expect(calls.map((call) => call.file)).toEqual(["/custom/zsh", "/bin/zsh"])
    expect(calls[0].args).toEqual(["-lic", "env -0"])
    expect(calls[0].options).toMatchObject({ timeout: 1500, killSignal: "SIGTERM" })
  })

  test("skips non-executable shells and resolves null on Windows without spawning", async () => {
    const win = fakeExecFile([])
    const windows = startLoginShellEnvCapture({ platform: "win32", env: {}, execFile: win.execFile })
    await expect(windows.promise).resolves.toBeNull()
    expect(win.calls).toHaveLength(0)

    const none = fakeExecFile([])
    const capture = startLoginShellEnvCapture({
      platform: "linux",
      env: { SHELL: "/x" },
      execFile: none.execFile,
      isExecutable: () => false,
    })
    await expect(capture.promise).resolves.toBeNull()
    expect(none.calls).toHaveLength(0)
  })

  test("enforces its own deadline when a shell leaves the output stream open", async () => {
    const children = []
    const execFile = () => {
      const child = {
        killed: [],
        kill(signal) {
          this.killed.push(signal)
        },
      }
      children.push(child)
      return child
    }
    const capture = startLoginShellEnvCapture({
      platform: "linux",
      env: { SHELL: "/bin/sh" },
      execFile,
      isExecutable: () => true,
      timeoutMs: 5,
    })
    await expect(capture.promise).resolves.toBeNull()
    expect(children.length).toBeGreaterThan(0)
    expect(children.every((child) => child.killed.includes("SIGTERM"))).toBe(true)
  })

  test("cancel stops the running shell and any further candidates", async () => {
    const children = []
    const execFile = () => {
      const child = {
        killed: [],
        kill(signal) {
          this.killed.push(signal)
        },
      }
      children.push(child)
      return child
    }
    const capture = startLoginShellEnvCapture({
      platform: "linux",
      env: { SHELL: "/bin/sh" },
      execFile,
      isExecutable: () => true,
      timeoutMs: 60_000,
    })
    capture.cancel()
    expect(children[0].killed).toEqual(["SIGTERM"])
    await expect(capture.promise).resolves.toBeNull()
    expect(children).toHaveLength(1)
  })

  test("encodes NUL-separated output as base64 and refuses oversized snapshots", () => {
    const raw = "A=1\0B=two\0"
    expect(Buffer.from(encodeLoginShellEnv(raw), "base64").toString("utf8")).toBe(raw)
    expect(encodeLoginShellEnv("")).toBeNull()
    expect(encodeLoginShellEnv(null)).toBeNull()
    expect(encodeLoginShellEnv(`K=${"x".repeat(MAX_FORWARDED_BYTES)}\0`)).toBeNull()
    expect(LOGIN_SHELL_ENV_VAR).toBe("AX_CODE_DESKTOP_LOGIN_SHELL_ENV")
  })

  test("forwards a snapshot, a failure marker, or nothing depending on the capture outcome", () => {
    const raw = "A=1\0"
    expect(Buffer.from(resolveForwardedLoginShellEnv(raw, "darwin"), "base64").toString("utf8")).toBe(raw)
    expect(resolveForwardedLoginShellEnv(null, "darwin")).toBe(LOGIN_SHELL_ENV_UNAVAILABLE)
    expect(resolveForwardedLoginShellEnv(null, "linux")).toBe(LOGIN_SHELL_ENV_UNAVAILABLE)
    // Oversize output cannot be forwarded, so the server must capture for itself.
    expect(resolveForwardedLoginShellEnv(`K=${"x".repeat(MAX_FORWARDED_BYTES)}\0`, "darwin")).toBeNull()
    // Windows has no login shell to capture; the server keeps its own path.
    expect(resolveForwardedLoginShellEnv(null, "win32")).toBeNull()
  })
})
