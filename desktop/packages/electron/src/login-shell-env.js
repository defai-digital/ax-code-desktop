"use strict"

const childProcess = require("node:child_process")
const fs = require("node:fs")

// Variable the web-server utilityProcess reads (and deletes) at bootstrap.
const LOGIN_SHELL_ENV_VAR = "AX_CODE_DESKTOP_LOGIN_SHELL_ENV"
// Sent instead of a snapshot when every shell candidate failed here, so the
// server does not repeat the same failing (and slow) captures. Must match
// web/server/lib/ax-code/env-runtime.js.
const LOGIN_SHELL_ENV_UNAVAILABLE = "unavailable"
const DEFAULT_TIMEOUT_MS = 2_000
const MAX_STDOUT_BYTES = 10 * 1024 * 1024
// A single environment string above ~128 KB makes execve fail on Linux, and the
// whole block shares the OS argument budget. Larger snapshots are not forwarded;
// the server then captures its own, exactly as before this optimization.
const MAX_FORWARDED_BYTES = 48 * 1024

function defaultIsExecutable(candidate) {
  try {
    if (!fs.statSync(candidate).isFile()) return false
    fs.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

// Starts the same `$SHELL -lic "env -0"` capture the web server performs at
// bootstrap, but at process start so its ~1 s of shell init overlaps Chromium,
// integrity verification and runtime preparation instead of delaying the
// server. Candidate order and the per-candidate deadline match
// env-runtime.js ensureLoginShellEnvSnapshotAsync. The raw output is only
// forwarded; main never applies it to its own process.env.
function startLoginShellEnvCapture({
  platform = process.platform,
  env = process.env,
  execFile = childProcess.execFile,
  isExecutable = defaultIsExecutable,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let cancelled = false
  let activeChild = null
  let settleActive = null

  async function capture() {
    if (platform === "win32") return null
    const candidates = [...new Set([env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(Boolean))]
    for (const shellPath of candidates) {
      if (cancelled) return null
      if (!isExecutable(shellPath)) continue
      const stdout = await new Promise((resolve) => {
        let settled = false
        let timer
        const finish = (value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          activeChild = null
          settleActive = null
          resolve(value)
        }
        try {
          const child = execFile(
            shellPath,
            ["-lic", "env -0"],
            {
              encoding: "utf8",
              maxBuffer: MAX_STDOUT_BYTES,
              windowsHide: true,
              timeout: timeoutMs,
              killSignal: "SIGTERM",
            },
            (error, out) => finish(error ? null : out || ""),
          )
          activeChild = child
          settleActive = finish
          // execFile's own timeout waits for inherited output streams; a shell
          // init script can leave descendants holding them, so enforce a hard
          // deadline as well.
          if (!settled) {
            timer = setTimeout(() => {
              child?.kill?.("SIGTERM")
              finish(null)
            }, timeoutMs)
            timer.unref?.()
          }
        } catch {
          finish(null)
        }
      })
      if (typeof stdout === "string" && stdout.includes("=")) return stdout
    }
    return null
  }

  const promise = capture().catch(() => null)

  return {
    promise,
    cancel() {
      cancelled = true
      try {
        activeChild?.kill?.("SIGTERM")
      } catch {
        // The child may already have exited.
      }
      // Do not wait for the child's callback: resolve the pending candidate now.
      settleActive?.(null)
    },
  }
}

// Environment variables cannot carry NUL, so the NUL-separated output travels
// base64-encoded. Returns null when there is nothing safe to forward (empty or
// too large); the server then captures its own snapshot.
function encodeLoginShellEnv(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null
  const buffer = Buffer.from(raw, "utf8")
  if (buffer.length > MAX_FORWARDED_BYTES) return null
  return buffer.toString("base64")
}

// What to hand the server: the encoded snapshot, the "unavailable" marker when
// the capture itself failed on a platform that has a login shell, or null to
// let the server capture (Windows, oversize output).
function resolveForwardedLoginShellEnv(raw, platform = process.platform) {
  if (platform === "win32") return null
  if (raw === null || raw === undefined) return LOGIN_SHELL_ENV_UNAVAILABLE
  return encodeLoginShellEnv(raw)
}

// Main supervises the runtime separately from the web server. Inherit only
// model-download settings; never copy a shell's full environment into main.
function modelDownloadRuntimeEnv(env, raw) {
  const result = { ...env }
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_STDOUT_BYTES) return result
  const allowed = new Set([
    "HF_TOKEN",
    "HUGGING_FACE_HUB_TOKEN",
    "HF_TOKEN_PATH",
    "HF_HOME",
    "HF_HUB_CACHE",
    "HF_ENDPOINT",
    "HF_HUB_OFFLINE",
    "HF_HUB_DISABLE_IMPLICIT_TOKEN",
    "HF_HUB_DISABLE_XET",
    "AX_ENGINE_PYTHON",
    "AX_ENGINE_HF_MAX_WORKERS",
  ])
  // env -0 terminates every entry; never forward an incomplete final value.
  for (const entry of raw.split("\0").slice(0, -1)) {
    const split = entry.indexOf("=")
    if (split < 1) continue
    const name = entry.slice(0, split)
    const value = entry.slice(split + 1)
    if (!value.trim() || /[\r\n\x00-\x1f\x7f]/.test(value)) continue
    if (name === "AX_ENGINE_HF_MAX_WORKERS" && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 32))
      continue
    if (allowed.has(name) && result[name] === undefined) result[name] = value
  }
  return result
}

module.exports = {
  LOGIN_SHELL_ENV_UNAVAILABLE,
  LOGIN_SHELL_ENV_VAR,
  MAX_FORWARDED_BYTES,
  encodeLoginShellEnv,
  resolveForwardedLoginShellEnv,
  startLoginShellEnvCapture,
  modelDownloadRuntimeEnv,
}
