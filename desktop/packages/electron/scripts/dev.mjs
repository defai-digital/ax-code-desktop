#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { resolveDevAxCodeBinary } from "./resolve-dev-ax-code-binary.mjs"
import { waitForDevRenderer } from "./wait-for-dev-renderer.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Chromium keeps the key that encrypts the app's own cookies in the macOS
// Keychain ("AX Code Safe Storage"), and macOS asks for the login password
// whenever the binary asking is not the one that created the item. Development
// runs the stock Electron binary, which is ad-hoc signed and changes on every
// Electron upgrade, so that prompt can never be answered once and for all — and
// answering it means typing the login password into a dialog, which is exactly
// the habit we do not want to teach. The mock keychain keeps the prompt out of
// development; packaged builds stay on the real Keychain, where the signed app
// asks at most once per signing identity.
const devKeychainArgs = process.platform === "darwin" ? ["--use-mock-keychain"] : []

// Resolve the Electron the renderer should run on. Prefer the locally
// installed, pinned binary so it matches the version `rebuild:native` built
// node-pty against. Missing postinstall output is a broken workspace install;
// fail clearly instead of downloading an unreviewed runtime during startup.
const resolveElectron = () => {
  try {
    const bin = require("electron")
    if (typeof bin === "string" && fs.existsSync(bin)) return { command: bin, args: devKeychainArgs }
  } catch {
    // electron package present but binary not installed — fall through
  }
  const version = require("electron/package.json").version
  throw new Error(
    `[electron-dev] pinned electron ${version} binary is unavailable; rerun pnpm install before starting Desktop`,
  )
}
const electronDir = path.resolve(__dirname, "..")
const webDir = path.resolve(electronDir, "..", "web")
const root = path.resolve(electronDir, "..", "..")

const findFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Failed to allocate a local server port"))
          return
        }
        resolve(address.port)
      })
    })
  })

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal || code}`))
    })
  })

const spawnManaged = (children, command, args, options = {}) => {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    stdio: options.stdio || "inherit",
  })
  children.add(child)
  child.on("exit", () => children.delete(child))
  return child
}

const stopAll = (children) => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM")
  }
}

await run("node", [path.join(electronDir, "scripts", "bundle-main.mjs")], { cwd: electronDir })

const serverPort = Number.parseInt(process.env.AX_CODE_DESKTOP_ELECTRON_SERVER_PORT || "", 10) || (await findFreePort())
const children = new Set()

// Drop any leftover from a previous dev stack that reused this server port, so
// the Vite proxy never starts from a stale runtime origin.
const devUpstreamFilePath = path.join(os.tmpdir(), `ax-code-desktop-dev-runtime-upstream-${serverPort}.json`)
try {
  fs.rmSync(devUpstreamFilePath, { force: true })
} catch {}

const shutdown = () => {
  stopAll(children)
}
process.once("SIGINT", () => {
  shutdown()
  process.exit(130)
})
process.once("SIGTERM", () => {
  shutdown()
  process.exit(143)
})
process.once("exit", shutdown)

const devAxCodeBinary = resolveDevAxCodeBinary()
if (devAxCodeBinary) {
  console.log(`[electron-dev] AX_CODE_BINARY=${devAxCodeBinary}`)
}

// AX_ENGINE_PYTHON is not guessed here: an explicit value passes through
// process.env, and the runtime owns the fallback order for the download Python.

const sharedEnv = {
  ...process.env,
  AX_CODE_DESKTOP_PORT: String(serverPort),
  // Runtime supervision (S2.5): the Electron main process spawns/supervises
  // the ax-code runtime by default, in parallel with the web server. The
  // AX_CODE_DESKTOP_SUPERVISE_RUNTIME=0 escape hatch (web-supervised mode)
  // passes through via ...process.env — nothing to wire here.
  //
  // S2.4b: the web server publishes the ax-code runtime's current loopback
  // origin + Basic credential to this file on every origin transition, and the
  // Vite dev proxy (vite-api-runtime-proxy.ts) re-reads it to mirror the
  // packaged app:// routing. Dev-only — packaged runs never set it. Keyed on
  // the web server port so concurrent dev stacks never share a file.
  AX_CODE_DESKTOP_DEV_UPSTREAM_FILE: devUpstreamFilePath,
  ...(devAxCodeBinary ? { AX_CODE_BINARY: devAxCodeBinary } : {}),
}

const vite = spawnManaged(children, process.execPath, [path.join(webDir, "scripts", "dev-vite.mjs")], {
  cwd: webDir,
  env: sharedEnv,
  stdio: ["inherit", "inherit", "inherit", "ipc"],
})

vite.once("exit", (code, signal) => {
  console.error(`[electron-dev] Vite exited with ${signal || code}`)
  stopAll(children)
  process.exit(typeof code === "number" && code !== 0 ? code : 1)
})

const rendererUrl = await waitForDevRenderer(vite)
sharedEnv.AX_CODE_DESKTOP_RENDERER_PORT = new URL(rendererUrl).port
console.log(`[electron-dev] Renderer ready at ${rendererUrl}`)

const { command: electronCommand, args: electronArgs } = resolveElectron()
const electron = spawnManaged(children, electronCommand, [...electronArgs, path.join(electronDir, "dist", "main.js")], {
  cwd: root,
  env: {
    ...sharedEnv,
    AX_CODE_DESKTOP_ELECTRON_RENDERER_URL: rendererUrl,
    AX_CODE_DESKTOP_ELECTRON_SERVER_PORT: String(serverPort),
  },
})

electron.on("exit", (code, signal) => {
  stopAll(children)
  process.exit(typeof code === "number" ? code : signal ? 1 : 0)
})
