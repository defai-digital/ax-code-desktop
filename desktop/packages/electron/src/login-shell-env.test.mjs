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
  modelDownloadRuntimeEnv,
  mergeRuntimePath,
  runtimeExecutionEnv,
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

describe("model download runtime environment", () => {
  test("forwards captured model settings without importing unrelated secrets or shell injection", async () => {
    const { execFile } = fakeExecFile([
      "HF_TOKEN=synthetic-hf-credential\0HF_HOME=/custom/hf\0AX_ENGINE_PYTHON=/custom/python\0OPENAI_API_KEY=unrelated-secret\0NODE_OPTIONS=--inspect\0PATH=/shell/path\0",
    ])
    const capture = startLoginShellEnvCapture({ platform: "darwin", env: {}, execFile, isExecutable: () => true })
    const base = { PATH: "/runtime/path" }
    const env = modelDownloadRuntimeEnv(base, await capture.promise)
    expect(env).toEqual({
      PATH: "/runtime/path",
      HF_TOKEN: "synthetic-hf-credential",
      HF_HOME: "/custom/hf",
      AX_ENGINE_PYTHON: "/custom/python",
    })
    expect(base).toEqual({ PATH: "/runtime/path" })
  })

  test("explicit launcher values, including empty overrides, take precedence", () => {
    const base = { HF_TOKEN: "launcher-credential", HF_ENDPOINT: "", HF_HOME: "/launcher/hf" }
    expect(
      modelDownloadRuntimeEnv(
        base,
        "HF_TOKEN=shell-credential\0HF_ENDPOINT=https://mirror.example\0HF_HOME=/shell/hf\0",
      ),
    ).toEqual(base)
  })

  test("malformed, missing and oversized shell captures do not change the launch environment", () => {
    const base = { PATH: "/runtime/path" }
    for (const raw of [null, "not-an-env-entry\0=bad\0", "X=" + "x".repeat(10 * 1024 * 1024)]) {
      expect(modelDownloadRuntimeEnv(base, raw)).toEqual(base)
    }
  })
})

test("model env drops incomplete entries, invalid workers and control-bearing values", () => {
  expect(modelDownloadRuntimeEnv({}, "HF_HOME=/cache\0HF_TOKEN=partial")).toEqual({ HF_HOME: "/cache" })
  expect(modelDownloadRuntimeEnv({}, "AX_ENGINE_PYTHON=\0AX_ENGINE_HF_MAX_WORKERS=0\0HF_TOKEN=line1\nline2\0")).toEqual(
    {},
  )
  expect(modelDownloadRuntimeEnv({}, "AX_ENGINE_HF_MAX_WORKERS=4\0")).toEqual({ AX_ENGINE_HF_MAX_WORKERS: "4" })
})

describe("runtime search path", () => {
  const launcherPath = "/usr/bin:/bin:/usr/sbin:/sbin"

  test("a Dock launch gains the login-shell directories without losing the launcher ones", () => {
    const env = runtimeExecutionEnv(
      { PATH: launcherPath, HOME: "/Users/a" },
      "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin\0",
      "darwin",
    )
    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")
    expect(env.HOME).toBe("/Users/a")
  })

  test("orders shell, inherited and system directories and removes duplicates", () => {
    expect(mergeRuntimePath({ shellPath: "/shell/a:/shared:/shell/b", inheritedPath: "/shared:/launcher" })).toBe(
      "/shell/a:/shared:/shell/b:/launcher:/usr/bin:/bin:/usr/sbin:/sbin",
    )
  })

  test("drops relative, empty and control-bearing segments", () => {
    expect(mergeRuntimePath({ shellPath: "bin::./tools:/ok:/bad\ndir:/also ok", inheritedPath: "relative/path" })).toBe(
      "/ok:/also ok:/usr/bin:/bin:/usr/sbin:/sbin",
    )
  })

  test("system directories stay reachable when the launcher PATH is empty", () => {
    expect(mergeRuntimePath({ shellPath: "/opt/homebrew/bin", inheritedPath: undefined })).toBe(
      "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    )
  })

  test("a failed capture on macOS appends Homebrew directories after every existing entry", () => {
    const base = { PATH: launcherPath }
    for (const raw of [null, undefined, "HOME=/h\0", "PATH=/partial", "X=" + "x".repeat(10 * 1024 * 1024)]) {
      expect(runtimeExecutionEnv(base, raw, "darwin").PATH).toBe(`${launcherPath}:/opt/homebrew/bin:/usr/local/bin`)
    }
    // A launcher that already lists them keeps its own order.
    expect(runtimeExecutionEnv({ PATH: "/usr/local/bin:/usr/bin" }, null, "darwin").PATH).toBe(
      "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
    )
    expect(base).toEqual({ PATH: launcherPath })
  })

  test("a capture whose every PATH entry is rejected counts as failed", () => {
    const base = { PATH: launcherPath }
    expect(runtimeExecutionEnv(base, "PATH=relative/bin:./tools\0", "darwin").PATH).toBe(
      `${launcherPath}:/opt/homebrew/bin:/usr/local/bin`,
    )
    expect(runtimeExecutionEnv(base, "PATH=/bad\ndir\0", "darwin").PATH).toBe(
      `${launcherPath}:/opt/homebrew/bin:/usr/local/bin`,
    )
    expect(runtimeExecutionEnv(base, "PATH=relative/bin\0", "linux")).toEqual(base)
  })

  test("a successful capture is authoritative and gets no guessed directories", () => {
    expect(runtimeExecutionEnv({ PATH: launcherPath }, "PATH=/nix/bin\0", "darwin").PATH).toBe(
      `/nix/bin:${launcherPath}`,
    )
  })

  test("a failed capture on Linux leaves the launcher PATH untouched", () => {
    const base = { PATH: launcherPath }
    for (const raw of [null, undefined, "HOME=/h\0", "PATH=/partial"]) {
      expect(runtimeExecutionEnv(base, raw, "linux")).toEqual(base)
    }
  })

  test("Windows keeps its own search path", () => {
    const base = { Path: "C:\\Windows" }
    expect(runtimeExecutionEnv(base, "PATH=/opt/homebrew/bin\0", "win32")).toEqual(base)
  })

  test("only PATH is imported from the shell besides the model settings, and the input is not mutated", () => {
    const base = { PATH: launcherPath }
    const env = runtimeExecutionEnv(
      base,
      "PATH=/opt/homebrew/bin\0OPENAI_API_KEY=unrelated-secret\0NODE_OPTIONS=--inspect\0HF_HOME=/cache\0",
      "linux",
    )
    expect(Object.keys(env).sort()).toEqual(["HF_HOME", "PATH"])
    expect(base).toEqual({ PATH: launcherPath })
  })
})
