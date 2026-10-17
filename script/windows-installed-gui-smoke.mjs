import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
export const WINDOWS_GUI_MILESTONES = [
  "electron.app.ready",
  "server.utilityProcess.ready",
  "renderer.did-finish-load",
  "renderer.first-paint",
]

export async function runWindowsInstalledGuiSmoke(executable, { timeoutMs = 90_000 } = {}) {
  if (process.platform !== "win32") throw new Error("Windows GUI smoke requires Windows")
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "ax-windows-gui-"))
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const env = {
    ...process.env,
    AX_CODE_DESKTOP_ELECTRON_SERVER_PORT: String(port),
    AX_CODE_DESKTOP_DATA_DIR: path.join(temporary, "desktop"),
    AX_CODE_DESKTOP_DISABLE_AUTO_UPDATE: "1",
  }
  for (const key of [
    "ELECTRON_RUN_AS_NODE",
    "AX_CODE_BINARY",
    "AX_CODE_PATH",
    "AX_CODE_DESKTOP_AX_CODE_PATH",
    "AX_CODE_DESKTOP_AX_CODE_BIN",
    "AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY",
    "AX_CODE_DESKTOP_UI_PASSWORD",
  ])
    delete env[key]
  const child = spawn(executable, [`--user-data-dir=${path.join(temporary, "profile")}`], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  })
  let failure
  let output = ""
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-128 * 1024)
  }
  child.stdout.on("data", capture)
  child.stderr.on("data", capture)
  child.once("error", (error) => {
    failure = error
  })
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      if (failure) throw failure
      if (child.exitCode !== null) throw new Error(`Installed Windows GUI exited before readiness (${child.exitCode})`)
      try {
        const healthResponse = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
        const health = await healthResponse.json()
        const response = await fetch(`http://127.0.0.1:${port}/api/desktop/diagnostics/startup`, {
          signal: AbortSignal.timeout(2000),
        })
        const diagnostics = await response.json()
        const names = new Set((diagnostics.events || []).map((event) => event.name))
        if (
          healthResponse.ok &&
          response.ok &&
          (health.axCodeRunning || health.isAxCodeReady) &&
          WINDOWS_GUI_MILESTONES.every((name) => names.has(name))
        ) {
          if (!output.includes("source: bundled")) throw new Error("Windows GUI did not select the bundled runtime")
          return { status: "passed", runtimeVersion: health.axCodeVersion, milestones: WINDOWS_GUI_MILESTONES }
        }
      } catch (error) {
        if (error?.message === "Windows GUI did not select the bundled runtime") throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    // Do not persist process output: runtime diagnostics can contain local paths.
    throw new Error("Installed Windows GUI did not reach runtime health and first paint before the deadline")
  } finally {
    if (child.pid && child.exitCode === null) {
      await execFileAsync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(
        () => {},
      )
    }
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}
