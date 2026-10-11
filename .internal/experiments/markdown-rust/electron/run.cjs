const { app, BrowserWindow, protocol, ipcMain } = require("electron")
const { Worker } = require("node:worker_threads")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const repo = path.resolve(__dirname, "../../../..")
const rendererProtocol = require(path.join(repo, "desktop/packages/electron/src/desktop-renderer-protocol.js"))
protocol.registerSchemesAsPrivileged(rendererProtocol.PACKAGED_RENDERER_PRIVILEGED_SCHEMES)
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-native-markdown-")))
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const output = process.env.AX_NATIVE_BENCH_OUTPUT
if (!output) throw new Error("AX_NATIVE_BENCH_OUTPUT is required")
let backend, currentWindow, nativePid
const pending = new Map()
function disposeBackend() {
  if (nativePid) {
    try {
      process.kill(nativePid)
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
  nativePid = null
  backend?.terminate()
  backend = null
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer)
    reject(new Error("Backend terminated"))
  }
  pending.clear()
}
ipcMain.handle("benchmark:markdown", (event, request) => {
  if (
    event.sender !== currentWindow?.webContents ||
    !event.sender.getURL().startsWith("app://ax-code/native-markdown-perf/")
  )
    throw new Error("Unknown fixture sender")
  if (
    typeof request.text !== "string" ||
    request.text.length > 1_000_000 ||
    !Number.isSafeInteger(request.id) ||
    pending.size
  )
    throw new Error("Invalid or concurrent fixture request")
  if (!backend) {
    backend = new Worker("/tmp/ax-coder-native-markdown-backend.cjs", {
      env: {
        ...process.env,
        AX_NATIVE_BENCH_BINARY: path.join(
          repo,
          ".internal/experiments/markdown-rust/target/release/ax-coder-markdown-bench",
        ),
      },
    })
    backend.on("message", (response) => {
      if (response.nativePid) {
        nativePid = response.nativePid
        return
      }
      const handler = pending.get(response.id)
      if (handler) {
        pending.delete(response.id)
        clearTimeout(handler.timer)
        handler.resolve(response)
      }
    })
    backend.on("error", (error) => {
      console.error(error)
      disposeBackend()
    })
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      disposeBackend()
    }, 5000)
    pending.set(request.id, { resolve, reject, timer })
    backend.postMessage(request)
  })
})
app
  .whenReady()
  .then(async () => {
    fs.mkdirSync(output, { recursive: true })
    protocol.handle(
      "app",
      rendererProtocol.createPackagedRendererProtocolHandler({
        webDistPath: process.env.AX_NATIVE_BENCH_DIST ?? "/tmp/ax-coder-native-markdown-baseline-dist",
        readFile: (file) => fs.promises.readFile(file),
        getApiOrigin: () => "",
      }),
    )
    const results = []
    for (const scenario of ["paragraph", "blocks", "small", "links"].filter(
      (scenario) =>
        !process.env.AX_NATIVE_BENCH_SCENARIO || process.env.AX_NATIVE_BENCH_SCENARIO.split(",").includes(scenario),
    )) {
      for (const parser of (process.env.AX_NATIVE_BENCH_REVERSE === "1" ? ["rust", "js"] : ["js", "rust"]).filter(
        (parser) => !process.env.AX_NATIVE_BENCH_PARSER || process.env.AX_NATIVE_BENCH_PARSER === parser,
      )) {
        if (["small", "links"].includes(scenario) && parser === "rust") continue
        const win = new BrowserWindow({
          width: 1440,
          height: 1000,
          show: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, "preload.cjs"),
          },
        })
        currentWindow = win
        win.webContents.on("console-message", (event) => {
          if (event.level === "error") console.error("Renderer:", event.message)
        })
        const evaluate = (expression) => win.webContents.executeJavaScript(expression)
        await win.loadURL(`app://ax-code/native-markdown-perf/renderer.html?parser=${parser}`)
        await pause(1000)
        await evaluate(`markdownFixture.setup(${JSON.stringify(scenario)})`)
        await pause(2500)
        const trace = []
        let finishTrace
        const tracingComplete = new Promise((resolve) => {
          finishTrace = resolve
        })
        win.webContents.debugger.attach("1.3")
        win.webContents.debugger.on("message", (_event, method, params) => {
          if (method === "Tracing.dataCollected") trace.push(...params.value)
          if (method === "Tracing.tracingComplete") finishTrace()
        })
        await win.webContents.debugger.sendCommand("Tracing.start", {
          categories: "devtools.timeline,blink.user_timing",
          options: "record-as-much-as-possible",
        })
        await evaluate("markdownFixture.start()")
        const keys = setInterval(() => {
          win.webContents.sendInputEvent({ type: "keyDown", keyCode: "A" })
          win.webContents.sendInputEvent({ type: "char", keyCode: "a" })
          win.webContents.sendInputEvent({ type: "keyUp", keyCode: "A" })
        }, 150)
        try {
          for (let revision = 0; revision <= 12; revision++) {
            await evaluate(`markdownFixture.publish(${revision})`)
            const deadline = Date.now() + 15000
            while (!(await evaluate(`markdownFixture.completed(${revision})`))) {
              if (Date.now() > deadline) throw new Error(`${parser}/${scenario}/${revision} did not format`)
              await pause(30)
            }
            await pause(100)
          }
        } finally {
          clearInterval(keys)
        }
        await pause(300)
        const result = await evaluate("markdownFixture.stop()")
        await win.webContents.debugger.sendCommand("Tracing.end")
        await tracingComplete
        const marks = trace.filter((event) => event.name.startsWith("ax-markdown:"))
        const paints = trace.filter((event) => event.name === "Paint").sort((a, b) => a.ts - b.ts)
        fs.writeFileSync(
          path.join(output, `${parser}-${scenario}-paint-trace.json`),
          JSON.stringify({ marks, paints }, null, 2),
        )
        result.paintSamples = result.samples.map((sample) => {
          const start = marks.find((event) => event.name === `ax-markdown:start:${sample.revision}`)
          const commit = marks.find((event) => event.name === `ax-markdown:commit:${sample.revision}`)
          if (!start || !commit)
            throw new Error(
              `Missing source/commit trace marker ${sample.revision}: ${marks.map((mark) => mark.name).join(",")}`,
            )
          const paint = paints.find(
            (event) => event.pid === commit.pid && event.tid === commit.tid && event.ts >= commit.ts,
          )
          if (!paint) throw new Error("Missing Chromium paint after formatted commit")
          return {
            revision: sample.revision,
            startTs: start.ts,
            commitTs: commit.ts,
            paintTs: paint.ts,
            elapsedMs: (paint.ts + (paint.dur ?? 0) - start.ts) / 1000,
          }
        })
        const sorted = result.paintSamples
          .filter((sample) => sample.revision >= 3)
          .map((sample) => sample.elapsedMs)
          .sort((a, b) => a - b)
        result.requestToChromiumPaintP95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]
        fs.writeFileSync(
          path.join(output, `${parser}-${scenario}-paint-trace.json`),
          JSON.stringify({ marks, paints }, null, 2),
        )
        result.electron = process.versions.electron
        result.chrome = process.versions.chrome
        if (
          result.errors.length ||
          !result.finalMarker || !result.markerVisible ||
          result.receivedKeys !== result.inputCharacters ||
          result.samples.length !== 13 ||
          result.workerMessages !== (scenario === "small" ? 0 : 13)
        )
          throw new Error(`Incomplete replay: ${JSON.stringify(result)}`)
        if ((parser === "rust") !== (result.nativeRequests === 13)) throw new Error("Native path was not exercised")
        results.push(result)
        fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2))
        await win.webContents
          .capturePage()
          .then((image) => fs.writeFileSync(path.join(output, `${parser}-${scenario}.png`), image.toPNG()))
        console.log(JSON.stringify(result))
        win.close()
        currentWindow = null
        disposeBackend()
      }
    }
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    disposeBackend()
    app.exit(1)
  })
