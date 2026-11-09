"use strict"

const { spawn } = require("child_process")

// A launcher that has not exited by now is taken as launched: some candidates are the app itself rather than
// a shim that hands off and exits, and a broken shim that hangs would otherwise hold the IPC call (and every
// later click's child) forever. The child is left running, since it may be the app the user asked for.
const LAUNCHER_SETTLE_TIMEOUT_MS = 10_000

// Wait for launchers without blocking Electron's window and IPC event loop.
const runOpenSpecChain = async (specs, appName, spawnProcess = spawn, { settleTimeoutMs = LAUNCHER_SETTLE_TIMEOUT_MS } = {}) => {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error(`Failed to open in ${appName}: no launch candidates`)
  }
  const failures = []
  for (const spec of specs) {
    try {
      const status = await new Promise((resolve, reject) => {
        const child = spawnProcess(spec.program, spec.args, { stdio: "ignore", windowsHide: true })
        const timer = setTimeout(() => {
          child.unref?.()
          resolve(0)
        }, settleTimeoutMs)
        child.once("error", (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.once("close", (code) => {
          clearTimeout(timer)
          resolve(code)
        })
      })
      if (status === 0) return
      failures.push(`${spec.program} exited ${status}`)
    } catch (error) {
      failures.push(`${spec.program}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Failed to open in ${appName}: ${failures.join("; ")}`)
}

// A cmd.exe command line that names each value through an environment variable instead of spelling it out.
// Quoting does not stop cmd from expanding `%VAR%` inside a value, and `call` doubles every caret even inside
// quotes, so `C:\work\%USERNAME%` opened the user's own folder and `C:\src\a^b` became `a^^b`. cmd expands each
// reference once and does not re-read the text it substituted. `call` is not used: it expands a second time.
// Windows paths cannot contain `"`, so the quotes around each reference hold.
const buildWindowsCommandLine = (leadingTokens, values, env = process.env) => {
  const nextEnv = { ...env }
  const references = values.map((value, index) => {
    const name = `AX_CODE_LAUNCH_ARG_${index}`
    nextEnv[name] = String(value)
    return `"%${name}%"`
  })
  return { commandLine: [...leadingTokens, ...references].join(" "), env: nextEnv }
}

module.exports = { runOpenSpecChain, buildWindowsCommandLine }
