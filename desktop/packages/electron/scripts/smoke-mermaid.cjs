const { app, BrowserWindow, protocol, nativeImage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const {
  PACKAGED_RENDERER_ORIGIN,
  PACKAGED_RENDERER_PRIVILEGED_SCHEMES,
  createPackagedRendererProtocolHandler,
} = require("../src/desktop-renderer-protocol")

app.setPath("userData", process.env.AX_MERMAID_SMOKE_PROFILE)
protocol.registerSchemesAsPrivileged(PACKAGED_RENDERER_PRIVILEGED_SCHEMES)

async function run() {
  await app.whenReady()
  const evidence = process.env.AX_MERMAID_SMOKE_EVIDENCE
  if (evidence) fs.mkdirSync(evidence, { recursive: true })
  const root = path.resolve(__dirname, "../../ui/dev/mermaid/dist")
  assert.ok(fs.existsSync(path.join(root, "index.html")), "Build the Mermaid fixture before running the smoke")
  protocol.handle("app", createPackagedRendererProtocolHandler({ webDistPath: root, readFile: fs.promises.readFile }))
  const window = new BrowserWindow({
    show: false,
    width: 1100,
    height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  const errors = []
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message)
  })
  const evaluate = (code) => window.webContents.executeJavaScript(code, true)
  const waitFor = async (code, timeout = 60_000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await evaluate(code)) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out: ${code}\n${await evaluate("document.body.innerText")}\n${errors.join("\n")}`)
  }
  await window.loadURL(`${PACKAGED_RENDERER_ORIGIN}/index.html`)
  await waitFor('Boolean(document.querySelector("[data-markdown=mermaid] svg"))')
  if (evidence) fs.writeFileSync(path.join(evidence, "pie-light.png"), (await window.webContents.capturePage()).toPNG())
  await evaluate(
    `Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Run render/export matrix").click()`,
  )
  await waitFor(
    `!Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Run render/export matrix").disabled && document.querySelector('[aria-label="Verification results"]').textContent.length > 0`,
    90_000,
  )
  const results = await evaluate(`document.querySelector('[aria-label="Verification results"]').textContent`)
  console.log(results)
  assert.ok(!results.includes("FAIL"), results)
  assert.equal(results.split("\n").length, 39)
  await evaluate(
    `Array.from(document.querySelectorAll("label")).find(l => l.textContent.trim() === "Dark theme").querySelector("input").click()`,
  )
  await waitFor('Boolean(document.querySelector("[data-markdown=mermaid] svg"))')
  await waitFor('Boolean(document.querySelector("[data-mermaid-theme=dark] [data-markdown=mermaid] svg"))')
  const darkTitleFill = await evaluate(
    'getComputedStyle(document.querySelector("[data-markdown=mermaid] svg .pieTitleText")).fill',
  )
  assert.notEqual(darkTitleFill, "rgb(0, 0, 0)", "Dark-theme title must retain its text styling")
  if (evidence) fs.writeFileSync(path.join(evidence, "pie-dark.png"), (await window.webContents.capturePage()).toPNG())
  await evaluate(
    `Array.from(document.querySelectorAll("label")).find(l => l.textContent.trim() === "Fullscreen styles").querySelector("input").click()`,
  )
  await waitFor('Boolean(document.querySelector(".markdown-mermaid-fullscreen"))')
  const fullscreenBounds = await evaluate(`(() => {
    const block = document.querySelector('[data-markdown="mermaid-block"]').getBoundingClientRect();
    const scroll = document.querySelector('[data-markdown="mermaid-scroll"]').getBoundingClientRect();
    const controls = document.querySelector('[data-mermaid-controls]').getBoundingClientRect();
    return { blockBottom: block.bottom, scrollBottom: scroll.bottom, scrollHeight: scroll.height, controlsHeight: controls.height };
  })()`)
  assert.ok(
    fullscreenBounds.scrollBottom <= fullscreenBounds.blockBottom + 1,
    "Fullscreen controls must not push the diagram outside its viewport",
  )
  assert.ok(fullscreenBounds.scrollHeight > 0 && fullscreenBounds.controlsHeight > 0)
  await evaluate(
    `Array.from(document.querySelectorAll("label")).find(l => l.textContent.trim() === "Fullscreen styles").querySelector("input").click()`,
  )
  const downloadPath = path.join(process.env.AX_MERMAID_SMOKE_PROFILE, "diagram.png")
  const downloaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PNG download timed out")), 10_000)
    window.webContents.session.once("will-download", (_event, item) => {
      item.setSavePath(downloadPath)
      item.once("done", (_done, state) => {
        clearTimeout(timer)
        if (state === "completed") resolve()
        else reject(new Error(`PNG download ${state}`))
      })
    })
  })
  await evaluate(`Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Download PNG").click()`)
  await downloaded
  assert.ok(!nativeImage.createFromPath(downloadPath).isEmpty(), "Downloaded PNG must decode")
  await evaluate(`Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Show source").click()`)
  assert.equal(await evaluate('Boolean(document.querySelector("[data-markdown=mermaid] svg"))'), false)
  await evaluate(`Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Show diagram").click()`)
  await waitFor('Boolean(document.querySelector("[data-markdown=mermaid] svg"))')
  await evaluate(
    `Array.from(document.querySelectorAll("label")).find(l => l.textContent.trim() === "ASCII mode").querySelector("input").click()`,
  )
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes("requires SVG")`)
  await evaluate(
    `Array.from(document.querySelectorAll("label")).find(l => l.textContent.trim() === "Streaming").querySelector("input").click()`,
  )
  await waitFor(`document.querySelector('[role="status"]')?.textContent.includes("response is complete")`)
  assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'), false)
  // The existing app CSP includes IPv6 wildcard sources that Chromium ignores.
  // Keep that baseline diagnostic in the receipt; fail on every other error,
  // including worker/script policy violations introduced by this change.
  const baselineCspWarning =
    /^The source list for the Content Security Policy directive '(?:connect-src|frame-src)' contains an invalid source: '(?:https?|wss?):\/\/\[::1\]:\*'\. It will be ignored\.$/
  assert.deepEqual(
    errors.filter((message) => !baselineCspWarning.test(message)),
    [],
  )
  const output = {
    electron: process.versions.electron,
    origin: PACKAGED_RENDERER_ORIGIN,
    results: results.split("\n"),
    interactions: ["dark theme", "fullscreen layout", "PNG download", "source toggle", "ASCII limitation", "streaming"],
    baselineCspWarnings: [...new Set(errors.filter((message) => baselineCspWarning.test(message)))],
  }
  if (evidence) fs.writeFileSync(path.join(evidence, "result.json"), JSON.stringify(output, null, 2))
  window.destroy()
  console.log("MERMAID_SMOKE_OK")
}
run().then(
  () => app.exit(0),
  (error) => {
    console.error(error)
    app.exit(1)
  },
)
