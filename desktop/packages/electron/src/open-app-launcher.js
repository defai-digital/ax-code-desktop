"use strict"

const { spawn } = require("child_process")

// Wait for launchers without blocking Electron's window and IPC event loop.
const runOpenSpecChain = async (specs, appName, spawnProcess = spawn) => {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error(`Failed to open in ${appName}: no launch candidates`)
  }
  const failures = []
  for (const spec of specs) {
    try {
      const status = await new Promise((resolve, reject) => {
        const child = spawnProcess(spec.program, spec.args, { stdio: "ignore", windowsHide: true })
        child.once("error", reject)
        child.once("close", resolve)
      })
      if (status === 0) return
      failures.push(`${spec.program} exited ${status}`)
    } catch (error) {
      failures.push(`${spec.program}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Failed to open in ${appName}: ${failures.join("; ")}`)
}

module.exports = { runOpenSpecChain }
