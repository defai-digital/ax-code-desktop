import { execFile, spawn } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { readRuntimePin } from "../../../../../script/runtime-pin.mjs"
import { createSmokeAppCopy, findMacExecutable, isStubProcessCommand } from "../smoke-packaged-app.mjs"
import { writeStubRuntime } from "./stub-runtime.mjs"

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const electronPackageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export const allocatePort = () =>
  new Promise((resolve, reject) => {
    const server = http.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = address && typeof address === "object" ? address.port : 0
      server.close(() => resolve(port))
    })
  })

/**
 * The command, arguments and environment for one isolated launch. Pure so the
 * isolation guarantees (own profile, own data dir, stub runtime, no updater,
 * loopback-only debugging port) are unit tested.
 */
export const buildLaunchSpec = ({
  executable,
  appDir = "",
  userDataDir,
  dataDir,
  stubRuntime,
  debuggingPort,
  serverPort,
  platform = process.platform,
  baseEnv = process.env,
}) => {
  if (!executable) throw new Error("An Electron executable is required")
  if (!userDataDir || !dataDir || !stubRuntime)
    throw new Error("Isolated profile, data dir and stub runtime are required")
  if (!Number.isInteger(debuggingPort) || debuggingPort <= 0) throw new Error("A debugging port is required")
  const args = [
    ...(appDir ? [appDir] : []),
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debuggingPort}`,
    "--remote-debugging-address=127.0.0.1",
    ...(platform === "darwin" ? ["--use-mock-keychain"] : []),
  ]
  const env = {
    ...baseEnv,
    AX_CODE_BINARY: stubRuntime,
    AX_CODE_DESKTOP_DATA_DIR: dataDir,
    AX_CODE_DESKTOP_ELECTRON_SERVER_PORT: String(serverPort),
    AX_CODE_DESKTOP_AX_CODE_HEALTH_TIMEOUT_MS: "1500",
    AX_CODE_DESKTOP_AX_CODE_HEALTH_INTERVAL_MS: "0",
    AX_CODE_DESKTOP_DISABLE_AUTO_UPDATE: "1",
  }
  // A development renderer URL or a real runtime path inherited from the
  // caller's shell would bypass the build or the stub under test.
  for (const key of [
    "AX_CODE_DESKTOP_ELECTRON_RENDERER_URL",
    "AX_CODE_PATH",
    "AX_CODE_DESKTOP_AX_CODE_PATH",
    "AX_CODE_DESKTOP_AX_CODE_BIN",
    "AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY",
    "ELECTRON_RUN_AS_NODE",
  ]) {
    delete env[key]
  }
  return { command: executable, args, env }
}

const waitForExit = (child, timeoutMs) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode) return resolve(true)
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once("exit", onExit)
  })

const killStubProcesses = async (stubRuntime) => {
  if (typeof stubRuntime !== "string" || stubRuntime.length === 0) return
  try {
    const { stdout } = await execFileAsync("ps", ["-Ao", "pid=,command="])
    const pids = String(stdout)
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
      .filter((match) => match && isStubProcessCommand(match[2], stubRuntime))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((pid) => Number.isFinite(pid) && pid !== process.pid)
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL")
      } catch {}
    }
  } catch {}
}

/**
 * Launches the built app (unpackaged by default, or a packaged macOS .app) in
 * an isolated profile. Teardown stops only processes this launch started.
 */
export const launchDesktop = async ({ app = "" } = {}) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-desktop-e2e-"))
  const stdout = []
  const stderr = []
  let child = null
  let stubRuntime = ""
  try {
    // Report the pinned runtime version so version gates behave as in a real install.
    stubRuntime = await writeStubRuntime(tmpDir, { version: readRuntimePin().version })
    let executable
    let appDir = ""
    if (app) {
      if (process.platform !== "darwin") throw new Error("--app currently supports macOS .app bundles only")
      const appCopy = await createSmokeAppCopy({ appPath: app, tmpDir })
      executable = await findMacExecutable(appCopy)
    } else {
      executable = require("electron")
      appDir = electronPackageDir
      await fs.access(path.join(appDir, "dist", "main.js")).catch(() => {
        throw new Error("Unpackaged build not found; run `pnpm run build` first")
      })
    }
    const debuggingPort = await allocatePort()
    const serverPort = await allocatePort()
    const spec = buildLaunchSpec({
      executable,
      appDir,
      userDataDir: path.join(tmpDir, "user-data"),
      dataDir: path.join(tmpDir, "data"),
      stubRuntime,
      debuggingPort,
      serverPort,
    })
    child = spawn(spec.command, spec.args, { env: spec.env, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.on("data", (chunk) => stdout.push(chunk.toString()))
    child.stderr.on("data", (chunk) => stderr.push(chunk.toString()))

    const stop = async () => {
      if (child && child.exitCode === null && !child.signalCode) {
        child.kill("SIGTERM")
        if (!(await waitForExit(child, 5000))) {
          child.kill("SIGKILL")
          await waitForExit(child, 3000)
        }
      }
      await killStubProcesses(stubRuntime)
      await sleep(200)
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
    return { child, debuggingPort, serverPort, tmpDir, stdout, stderr, stop }
  } catch (error) {
    if (child) child.kill("SIGKILL")
    await killStubProcesses(stubRuntime)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}
