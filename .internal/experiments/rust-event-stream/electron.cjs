const { app, BrowserWindow, ipcMain } = require("electron")
const { createServer } = require("node:http")
const { createRequire } = require("node:module")
const { pathToFileURL } = require("node:url")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const assert = require("node:assert/strict")
const { randomUUID } = require("node:crypto")
const root = process.env.AX_EVENT_BENCH_ROOT
const dist = process.env.AX_EVENT_BENCH_DIST
const output = process.env.AX_EVENT_BENCH_OUTPUT
if (!root || !dist || !output) throw new Error("Fixture paths are required")
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ax-native-events-profile-"))
app.setPath("userData", profile)
app.on("window-all-closed", () => {})
const authorization = `Bearer ${randomUUID()}`
let window, active, server, runtime, native, keyTimer
let batchWindow
const load = (relative) => import(pathToFileURL(path.join(root, relative)).href)
const epoch = () => performance.timeOrigin + performance.now()
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const trusted = (event) => event.sender === window?.webContents && event.senderFrame?.url.startsWith(active?.pageUrl)

ipcMain.on("fixture:ack", (event, sequence, cursor) => {
  if (!trusted(event)) return
  batchWindow?.acknowledge(sequence, cursor)
})
ipcMain.on("fixture:start", (event) => {
  if (!trusted(event) || active.started) return
  active.started = true
  if (active.mode === "js") return
  const run = active
  run.pump = (async () => {
    const { startRustEventStream } = await load(".internal/experiments/rust-event-stream/native-client.mjs")
    const { decodeNativeBatch } = await load(".internal/experiments/rust-event-stream/batch-protocol.mjs")
    const { createJsEventStream } = await load(".internal/experiments/rust-event-stream/js-client.mjs")
    const controller = new AbortController()
    run.stop = () => controller.abort()
    const stream =
      run.mode === "rust"
        ? (native = startRustEventStream({ endpoint: run.endpoint, authorization, lastEventId: batchWindow.cursor }))
            .batches
        : createJsEventStream({ endpoint: run.endpoint, authorization, signal: controller.signal })
    // Only numeric RSS is sampled. The helper receives no credentials in its command line.
    setTimeout(async () => {
      try {
        if (!native) return
        const { stdout } = await promisify(execFile)("ps", ["-o", "rss=", "-p", String(native.pid)])
        run.rustRssKiB = Number(stdout.trim())
      } catch {}
    }, 250)
    for await (const item of stream) {
      const batch = run.mode === "rust" ? decodeNativeBatch(item) : item.batch
      const bytes = run.mode === "rust" ? Buffer.byteLength(item) : item.byteLength
      await batchWindow.send(batch, bytes, (sequence, payload) =>
        window.webContents.send("fixture:batch", sequence, payload),
      )
    }
  })().catch(() => run.reject(new Error("Native fixture transport failed")))
})
ipcMain.on("fixture:finished", (event, result) => {
  if (trusted(event)) active.resolve(result)
})

app
  .whenReady()
  .then(async () => {
    const { NativeBatchWindow } = await load(".internal/experiments/rust-event-stream/batch-window.mjs")
    const { createMessageStreamWsRuntime } = await load("desktop/packages/web/server/lib/event-stream/runtime.js")
    server = createServer((req, res) => {
      if (req.url.startsWith("/global/event")) {
        if (req.headers.authorization !== authorization) {
          res.writeHead(401)
          res.end()
          return
        }
        const run = active
        res.writeHead(200, { "content-type": "text/event-stream" })
        let cursor = 0
        const send = (directory, payload) =>
          res.write(`id: c${++cursor}\ndata: ${JSON.stringify({ directory, payload })}\n\n`)
        send("global", { type: "server.connected" })
        let revision = 0
        const timer = setInterval(() => {
          const sentAt = epoch()
          revision++
          for (let project = 0; project < run.projects; project++) {
            const directory = `/fixture/${project}`
            for (let token = 0; token < 50; token++)
              send(directory, {
                type: "message.part.delta",
                properties: {
                  sessionID: "ses_fixture",
                  messageID: `msg_${project}_${revision}`,
                  partID: "prt_live",
                  field: "text",
                  delta: "x",
                },
              })
            send(directory, { type: "fixture.revision", properties: { project, revision, sentAt } })
          }
          if (revision === 40) {
            clearInterval(timer)
            setTimeout(() => res.end(), 30)
          }
        }, 25)
        res.on("close", () => clearInterval(timer))
        return
      }
      if (req.url.split("?")[0] === "/renderer.js") {
        res.setHeader("content-type", "text/javascript")
        res.end(fs.readFileSync(path.join(dist, "renderer.js")))
        return
      }
      res.setHeader("content-type", "text/html")
      res.end(
        '<!doctype html><title>Native event fixture</title><div id="root"></div><script src="/renderer.js"></script>',
      )
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const results = []
    const webContentsErrors = []
    for (const projects of [1, 5, 20]) {
      for (let round = 0; round < 4; round++) {
        const modes = ["js", "ipc-js", "rust"]
        const order = [...modes.slice(round % modes.length), ...modes.slice(0, round % modes.length)]
        for (const mode of order) {
          batchWindow = new NativeBatchWindow()
          let resolve, reject
          const completed = new Promise((done, fail) => {
            resolve = done
            reject = fail
          })
          active = {
            mode,
            projects,
            endpoint: `${origin}/global/event`,
            pageUrl: `${origin}/?mode=${mode}&projects=${projects}`,
            resolve,
            reject,
          }
          if (mode === "js")
            runtime = createMessageStreamWsRuntime({
              server,
              wsClients: new Set(),
              isRequestOriginAllowed: async () => true,
              rejectWebSocketUpgrade: (_req, socket) => socket.destroy(),
              markWebSocketUpgradeClaimed: () => {},
              buildAxCodeUrl: (pathname) => `${origin}${pathname}`,
              getAxCodeAuthHeaders: () => ({ Authorization: authorization }),
              processForwardedEventPayload: () => {},
              triggerHealthCheck: () => {},
            })
          window = new BrowserWindow({
            width: 1000,
            height: 800,
            show: false,
            webPreferences: {
              offscreen: true,
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              backgroundThrottling: false,
              preload: path.join(__dirname, "preload.cjs"),
            },
          })
          window.webContents.on("console-message", (event) => {
            if (event.level === "error") webContentsErrors.push(event.message)
          })
          const cpuStart = process.cpuUsage()
          await window.loadURL(active.pageUrl)
          let keys = 0
          keyTimer = setInterval(() => {
            if (keys++ >= 10) {
              clearInterval(keyTimer)
              return
            }
            for (const type of ["keyDown", "char", "keyUp"])
              window.webContents.sendInputEvent({ type, keyCode: type === "char" ? "a" : "A" })
          }, 70)
          let watchdog
          const result = await Promise.race([
            completed,
            new Promise((_, fail) => {
              watchdog = setTimeout(() => fail(new Error("Fixture timed out")), 10000)
            }),
          ])
          clearTimeout(watchdog)
          clearInterval(keyTimer)
          assert.equal(result.callbackErrors, 0)
          assert.equal(result.sync.groups.all.failedCallbacks, 0)
          assert.equal(result.totalAppliedCharacters, projects * 40 * 50)
          assert.ok(result.textLengths.every((length) => length === 50))
          assert.ok(result.appliedRevisions.every((revision) => revision === 40))
          assert.equal(result.typedCharacters, 10)
          assert.ok(result.commitSamples > 0)
          const cpu = process.cpuUsage(cpuStart)
          result.hostCpuMs = (cpu.user + cpu.system) / 1000
          result.rustRssKiB = active.rustRssKiB ?? null
          result.rendererMemoryKiB =
            app.getAppMetrics().find((metric) => metric.pid === window.webContents.getOSProcessId())?.memory
              .workingSetSize ?? null
          result.nativeBatches = native?.stats.batches ?? null
          result.round = round
          results.push(result)
          batchWindow.close()
          active.stop?.()
          if (native) {
            await native.close()
            native = null
          }
          if (active.pump) await active.pump
          if (runtime) {
            await runtime.close()
            runtime = null
          }
          window.destroy()
          window = null
          await pause(20)
        }
      }
    }
    assert.equal(webContentsErrors.length, 0, "Renderer console errors")
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const summary = [1, 5, 20].map((projects) => {
      const summarize = (mode) => {
        const rows = results.filter((row) => row.projects === projects && row.mode === mode && row.round > 0)
        return Object.fromEntries(
          [
            "publishToReactCommitP95Ms",
            "publishToNextFrameProxyP95Ms",
            "keyToFrameProxyP95Ms",
            "firstReadyMs",
            "hostCpuMs",
            "rendererMemoryKiB",
            "rustRssKiB",
          ].map((key) => [key, rows.every((row) => row[key] !== null) ? median(rows.map((row) => row[key])) : null]),
        )
      }
      return { projects, js: summarize("js"), ipcJs: summarize("ipc-js"), rust: summarize("rust") }
    })
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          schema: "ax-code-desktop.rust-event-experiment.v1",
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          platform: process.platform,
          arch: process.arch,
          warmupRounds: 1,
          measuredRounds: 3,
          scope:
            "Synthetic SSE producer, actual Desktop WS bridge/pipeline/reducer, React fixture. Next-frame metrics are proxies, not Chromium paint. Host CPU excludes Rust and renderer CPU.",
          summary,
          results,
        },
        null,
        2,
      ),
    )
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    app.quit()
  })
  .catch(async (error) => {
    console.error(error.message)
    clearInterval(keyTimer)
    batchWindow?.close()
    active?.stop?.()
    if (native) await native.close()
    if (runtime) await runtime.close()
    if (window && !window.isDestroyed()) window.destroy()
    server?.closeAllConnections()
    server?.close()
    app.exit(1)
  })
  .finally(() => {
    fs.rmSync(profile, { recursive: true, force: true })
  })
