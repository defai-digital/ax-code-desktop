'use strict'

// Runs inside an Electron utilityProcess, forked by the main process. Hosting the
// web/API server here keeps its CPU/IO (git scans, SQLite, file reads, SSE) off
// the main process event loop, so window management, IPC, and SSE delivery stay
// responsive. The renderer reaches this server over HTTP loopback exactly as
// before — only *where* the server runs changes.
//
// Environment variables the server reads at module-init time
// (OPENCHAMBER_DIST_DIR, OPENCHAMBER_RUNTIME, OPENCHAMBER_ELECTRON_SERVER_PORT)
// are supplied by the parent's utilityProcess.fork({ env }) call.

// Bundled server (dist/server.js produced by bundle-main.mjs). Kept as an
// external require so esbuild does not inline the 5 MB server into this entry.
const { startWebUiServer } = require('./server.js')

let serverHandle = null
let stopping = false

async function boot() {
  const configuredPort = Number.parseInt(process.env.OPENCHAMBER_ELECTRON_SERVER_PORT || '', 10)
  serverHandle = await startWebUiServer({
    port: Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 0,
  })
  process.parentPort.postMessage({ type: 'ready', port: serverHandle.getPort() })
}

async function stop() {
  if (stopping) return
  stopping = true
  try {
    // Graceful shutdown also terminates the ax-code child the server spawned.
    await serverHandle?.stop({ exitProcess: false })
  } catch {
    // Best-effort — we exit regardless.
  } finally {
    process.exit(0)
  }
}

process.parentPort.on('message', (event) => {
  if (event?.data?.type === 'stop') {
    void stop()
  }
})

boot().catch((err) => {
  try {
    process.parentPort.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } catch {
    // parentPort may be gone; fall through to exit.
  }
  process.exit(1)
})
