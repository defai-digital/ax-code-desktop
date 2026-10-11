#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
// Resolve once before spawning. New Electron packages install their binary lazily;
// concurrent cold-start resolutions can extract into the same dist directory.
const electron = require("electron")
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS
const child = spawn(
  electron,
  [path.join(import.meta.dirname, "smoke-electron-compatibility.cjs"), "--use-mock-keychain"],
  {
    env,
    stdio: "inherit",
  },
)
// A native module can block shutdown; bound the test outside Electron's event loop.
const timeout = setTimeout(() => {
  console.error("Electron compatibility smoke exceeded 25 seconds")
  child.kill("SIGKILL")
}, 25000)
try {
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolve(code))
  })
  if (status !== 0) throw new Error(`Electron compatibility smoke failed (${status})`)
} finally {
  clearTimeout(timeout)
}
