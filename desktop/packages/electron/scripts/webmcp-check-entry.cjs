"use strict"

// Electron entry for `pnpm run webmcp:check`. Loads one page in a throwaway profile with native WebMCP on, lists the
// tools it registers and runs the requested ones through the page's own model context. Never imported by the app.
const { app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const { runInputReceipt, toolIdentityReceipt } = require("./webmcp-check-receipt.cjs")
const { definitionDigest } = require("../../../shared/webmcp-digests.cjs")
const { redactWebMcpReport } = require("../../../shared/webmcp-redaction.mjs")

const config = JSON.parse(process.env.AX_WEBMCP_CHECK ?? "{}")
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])
// The project browser's rule, applied to every navigation and redirect, not only the starting address.
const allowedUrl = (value) => {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname))
  } catch {
    return false
  }
}

app.commandLine.appendSwitch("enable-features", "WebMCP")
// The launcher owns and later removes this profile directory.
app.setPath("userData", config.profile)

const report = { url: config.url, tools: [], runs: [] }
// Written after each step, so a crash or a hung page still leaves what was learned.
const save = () => fs.writeFileSync(config.output, JSON.stringify(redactWebMcpReport(report)))

async function check() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // A hidden window must not slow the page's timers, or late registrations would be missed.
      backgroundThrottling: false,
    },
  })
  const contents = window.webContents
  // The same hardening as the project browser: no popups, no permissions, no downloads, no leaving the allowed origins.
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  contents.session.setPermissionCheckHandler(() => false)
  contents.session.on("will-download", (event) => event.preventDefault())
  contents.on("will-navigate", (event, url) => {
    if (!allowedUrl(url)) event.preventDefault()
  })
  contents.on("will-redirect", (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame !== false && !allowedUrl(url)) event.preventDefault()
  })
  const live = new Map()
  await Promise.race([
    contents.loadURL(config.url),
    delay(config.timeoutMs).then(() => {
      throw new Error("the page did not load in time")
    }),
  ])
  if (!allowedUrl(contents.getURL())) throw new Error(`the page left the allowed origins (${contents.getURL()})`)
  contents.debugger.attach("1.3")
  await contents.debugger.sendCommand("Page.enable")
  const { frameTree } = await contents.debugger.sendCommand("Page.getFrameTree")
  let topFrameId = frameTree.frame.id
  let revision = 0
  let changedAt = Date.now()
  const changed = () => {
    revision += 1
    changedAt = Date.now()
  }
  contents.debugger.on("message", (_event, method, params) => {
    if (method === "Page.frameNavigated" && !params.frame.parentId) {
      topFrameId = params.frame.id
      live.clear()
      changed()
    }
    if (method === "WebMCP.toolsAdded")
      for (const tool of params.tools) {
        if (tool.frameId !== topFrameId) continue
        const previous = live.get(tool.name)
        if (!previous || definitionDigest(previous) !== definitionDigest(tool)) changed()
        live.set(tool.name, tool)
      }
    if (method === "WebMCP.toolsRemoved")
      for (const tool of params.tools) {
        if (tool.frameId === topFrameId && live.delete(tool.name)) changed()
      }
  })
  await contents.debugger.sendCommand("WebMCP.enable")
  // Pages often register after load (effects, fetched config). Wait until the catalog has been stable for a quiet
  // period, up to the settle limit.
  const deadline = Date.now() + config.settleMs
  let signature = null
  let quietSince = changedAt
  while (Date.now() < deadline) {
    const current = revision
    if (current !== signature) {
      signature = current
      quietSince = changedAt
    } else if (live.size > 0 && Date.now() - quietSince >= 750) break
    await delay(250)
  }
  report.tools = [...live.values()].map((tool) => ({
    name: tool.name,
    identityReceipt: toolIdentityReceipt(config.receiptKey, tool.name),
    description: tool.description ?? "",
    form: tool.backendNodeId !== undefined,
    annotations: tool.annotations ?? {},
    inputSchema: tool.inputSchema ?? null,
  }))
  save()
  let contaminated = false
  for (const [index, run] of (config.runs ?? []).entries()) {
    // The engine bundled with AX Code Desktop takes the input as a JSON string and answers with one.
    const result = contaminated ? { error: "not run: contaminated by an unconfirmed timeout", notRun: true } : await Promise.race([
      contents
        .executeJavaScript(
          `(async () => {
        const context = document.modelContext
        if (!context) return { error: "the page has no document.modelContext" }
        const tool = (await context.getTools()).find((candidate) => candidate.name === ${JSON.stringify(run.name)})
        if (!tool) return { error: "tool not registered" }
        try {
          return { output: await context.executeTool(tool, ${JSON.stringify(JSON.stringify(run.input))}) }
        } catch (error) {
          return { error: String(error && error.name ? error.name + ": " + error.message : error) }
        }
      })()`,
        )
        .catch((error) => ({
          error: `the page could not run the tool (${error instanceof Error ? error.message : error})`,
        })),
      delay(config.timeoutMs).then(() => ({ error: `the tool did not answer in ${config.timeoutMs} ms`, timedOut: true })),
    ])
    if (result.timedOut) contaminated = true
    report.runs.push({
      name: run.name,
      input: run.input,
      ...result,
      inputReceipt: runInputReceipt(config.receiptKey, index, run),
    })
    save()
  }
  window.destroy()
}

app.whenReady().then(async () => {
  try {
    await check()
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
  }
  save()
  // exit, not quit: a page's beforeunload cannot hold the process open.
  app.exit(0)
})
