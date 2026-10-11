"use strict"

// Controlled engine qualification only. Never imported by the desktop runtime.
const { app, BrowserWindow, WebContentsView } = require("electron")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")

const enabled = process.argv.includes("--probe-enable-webmcp")
const output = process.argv.find((arg) => arg.startsWith("--probe-output="))?.slice("--probe-output=".length)
if (!output) throw new Error("An explicit --probe-output path is required")
if (enabled) app.commandLine.appendSwitch("enable-features", "WebMCP")
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-webmcp-qualification-"))
app.setPath("userData", profile)
const report = {
  schema: "ax-coder.native-webmcp-qualification.v1",
  timestamp: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  featureEnabled: enabled,
  installedChromeUsed: false,
  remoteDebuggingPortUsed: false,
  productionQualified: false,
  checks: {},
  passed: false,
}
const fixture = `<!doctype html><meta charset="utf-8"><title>Native WebMCP qualification</title>
<form toolname="probe_auto" tooldescription="Return a controlled value" toolautosubmit>
<input name="value" required><button>Submit</button></form>
<form toolname="probe_manual" tooldescription="Return a value after fixture submission">
<input name="value" required><button>Submit</button></form>
<script>
globalThis.probe = { api: document.modelContext ? 'document' : null, canceled: false, submissions: [] };
globalThis.registration = new AbortController();
globalThis.ready = (async () => {
  const context = document.modelContext;
  if (!context) return;
  const schema = { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] };
  await context.registerTool({ name: 'probe_echo', description: 'Echo a controlled value', inputSchema: schema,
    execute: async ({ value }) => { probe.lastEchoInput = value; return { value }; } });
  await context.registerTool({ name: 'probe_slow', description: 'Wait until canceled', inputSchema: schema,
    execute: async (_input, { signal } = {}) => {
      probe.slowStarted = true;
      probe.abortSignalAvailable = Boolean(signal);
      return new Promise((_resolve, reject) => {
        const abort = () => { probe.canceled = true; reject(new Error('Fixture canceled')); };
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
      });
    } });
  await context.registerTool({ name: 'probe_hold', description: 'Wait for fixture completion', inputSchema: schema,
    execute: async ({ value }) => { probe.holdStarted = true; return new Promise(resolve => {
      globalThis.finishHold = () => resolve({ value });
    }); } }, { signal: registration.signal });
  await context.registerTool({ name: 'probe_debug', description: 'Inspect the fixture', inputSchema: schema,
    annotations: { debugging: true, readOnlyHint: true }, execute: async ({ value }) => ({ value }) });
})();
for (const form of document.forms) form.addEventListener('submit', event => {
  event.preventDefault();
  probe.submissions.push({ name: form.getAttribute('toolname'), agentInvoked: event.agentInvoked });
  if (event.respondWith) event.respondWith(Promise.resolve({ value: form.elements.value.value }));
});
</script>`
const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(request.url === "/empty" ? "<!doctype html><title>Empty fixture</title>" : fixture)
})
const events = []
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(read, label) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(25)
  }
  throw new Error(`Timed out waiting for ${label}`)
}
let window
let guest
const timeout = setTimeout(() => {
  report.error = "Native qualification exceeded 40 seconds"
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n")
  app.exit(1)
}, 40000)

async function run() {
  await app.whenReady()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const webPreferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
  window = new BrowserWindow({ show: false, webPreferences })
  guest = new WebContentsView({ webPreferences: { ...webPreferences, partition: "webmcp-qualification" } })
  window.contentView.addChildView(guest)
  guest.setBounds({ x: 0, y: 0, width: 800, height: 600 })
  const contents = guest.webContents
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  await contents.loadURL(origin)
  // Fixed evaluations target only the disposable loopback fixture.
  await contents.executeJavaScript("ready")
  report.fixture = await contents.executeJavaScript(
    "({ ...probe, secureContext: isSecureContext, nodeVisible: typeof process !== 'undefined' })",
  )
  assert.equal(report.fixture.secureContext, true)
  assert.equal(report.fixture.nodeVisible, false)
  contents.debugger.attach("1.3")
  contents.debugger.on("message", (_event, method, params) => {
    if (method.startsWith("WebMCP.")) events.push({ method, params })
  })
  const send = (method, params) => contents.debugger.sendCommand(`WebMCP.${method}`, params)
  try {
    await send("enable")
    report.nativeDomainAvailable = true
  } catch (error) {
    report.nativeDomainAvailable = false
    report.nativeDomainError = error.message
  }
  if (!enabled) {
    assert.equal(report.fixture.api, null)
    // The CDP domain can exist while the page feature remains disabled.
    // Check actual page/tool availability rather than equating domain presence with support.
    await delay(150)
    assert.equal(
      events.filter((event) => event.method === "WebMCP.toolsAdded").flatMap((event) => event.params.tools).length,
      0,
    )
    report.checks.featureDisabled = true
    report.passed = true
    return
  }
  assert.equal(report.fixture.api, "document")
  assert.equal(report.nativeDomainAvailable, true)
  const names = ["probe_echo", "probe_slow", "probe_hold", "probe_debug", "probe_auto", "probe_manual"]
  const tools = await waitFor(() => {
    const values = events.filter((event) => event.method === "WebMCP.toolsAdded").flatMap((event) => event.params.tools)
    return names.every((name) => values.some((tool) => tool.name === name)) && values
  }, "all imperative and declarative tools")
  report.tools = tools.map(({ name, frameId, annotations }) => ({ name, frameId, annotations }))
  report.checks.discovery = true
  const invoke = async (name) => {
    const tool = tools.find((entry) => entry.name === name)
    return send("invokeTool", { frameId: tool.frameId, toolName: name, input: { value: "qualification-value" } })
  }
  const responseFor = (invocation) =>
    waitFor(
      () =>
        events.find(
          (event) => event.method === "WebMCP.toolResponded" && event.params.invocationId === invocation.invocationId,
        )?.params,
      "invocation response",
    )
  const completed = async (invocation) => {
    const response = await responseFor(invocation)
    assert.equal(response.status, "Completed")
    assert.deepEqual(response.output, { value: "qualification-value" })
  }
  await completed(await invoke("probe_echo"))
  report.checks.imperativeInvocation = true
  await completed(await invoke("probe_auto"))
  report.checks.declarativeAutosubmit = true
  const manual = await invoke("probe_manual")
  await waitFor(
    () => contents.executeJavaScript("document.forms[1].elements.value.value === 'qualification-value'"),
    "manual form inputs",
  )
  await contents.executeJavaScript("document.forms[1].querySelector('button').click()")
  await completed(manual)
  report.checks.declarativeManualSubmit = true
  report.submissions = await contents.executeJavaScript("probe.submissions")
  assert.equal(report.submissions.length, 2)
  assert.ok(report.submissions.every((submission) => submission.agentInvoked === true))
  const slow = await invoke("probe_slow")
  await waitFor(() => contents.executeJavaScript("probe.slowStarted"), "cancelable execution")
  await send("cancelInvocation", slow)
  assert.equal((await responseFor(slow)).status, "Canceled")
  report.checks.cancellation = true
  if (Number(report.electron.split(".")[0]) >= 45) {
    await waitFor(() => contents.executeJavaScript("probe.canceled"), "execution abort signal")
  }
  report.checks.executionAbortSignal = await contents.executeJavaScript("probe.canceled")
  const hold = await invoke("probe_hold")
  await waitFor(() => contents.executeJavaScript("probe.holdStarted"), "in-flight execution")
  await contents.executeJavaScript("registration.abort()")
  await waitFor(
    () =>
      events.some(
        (event) =>
          event.method === "WebMCP.toolsRemoved" && event.params.tools.some((tool) => tool.name === "probe_hold"),
      ),
    "tool removal",
  )
  report.checks.toolRemoval = true
  await contents.executeJavaScript("finishHold()")
  report.removedInFlightResponse = await responseFor(hold)
  report.checks.removalPreservesInvocation =
    report.removedInFlightResponse.status === "Completed" &&
    report.removedInFlightResponse.output?.value === "qualification-value"
  report.checks.debuggingAnnotation = tools.find((tool) => tool.name === "probe_debug").annotations?.debugging === true
  try {
    await contents.executeJavaScript("probe.lastEchoInput = null")
    const value = await contents.executeJavaScript(`(async () => {
      const tools = await document.modelContext.getTools();
      return document.modelContext.executeTool(tools.find(tool => tool.name === 'probe_echo'), { value: 'qualification-value' });
    })()`)
    report.pageInvocationOutput = value
    report.checks.objectInput = await contents.executeJavaScript("probe.lastEchoInput === 'qualification-value'")
  } catch (error) {
    report.checks.objectInput = false
    report.objectInputError = error.message
  }
  const staleTool = tools.find((tool) => tool.name === "probe_echo")
  await contents.executeJavaScript("probe.slowStarted = false; probe.canceled = false")
  const navigating = await invoke("probe_slow")
  await waitFor(() => contents.executeJavaScript("probe.slowStarted"), "execution before navigation")
  await contents.loadURL(`${origin}/empty`)
  // Navigation can discard an invocation without emitting toolResponded. Record
  // that limitation instead of promising a terminal receipt or waiting forever.
  await delay(500)
  report.navigationResponse =
    events.find(
      (event) => event.method === "WebMCP.toolResponded" && event.params.invocationId === navigating.invocationId,
    )?.params ?? null
  report.navigationResponseObservationMs = 500
  if (report.navigationResponse) assert.ok(["Canceled", "Error"].includes(report.navigationResponse.status))
  const start = events.length
  await send("disable")
  await send("enable")
  // Enabling emits the initial catalog; drain the IPC event queue before checking it.
  await delay(150)
  const empty = events
    .slice(start)
    .filter((event) => event.method === "WebMCP.toolsAdded")
    .flatMap((event) => event.params.tools)
  assert.deepEqual(empty, [])
  await assert.rejects(() =>
    send("invokeTool", {
      frameId: staleTool.frameId,
      toolName: staleTool.name,
      input: { value: "qualification-value" },
    }),
  )
  report.checks.navigationCleanup = true
  if (Number(report.electron.split(".")[0]) >= 45) {
    for (const check of ["executionAbortSignal", "removalPreservesInvocation", "debuggingAnnotation", "objectInput"]) {
      assert.equal(report.checks[check], true, `${check} is required in the Electron 45 candidate`)
    }
  }
  report.passed = true
}

run()
  .catch((error) => {
    report.error = error.stack || String(error)
  })
  .finally(async () => {
    clearTimeout(timeout)
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n")
    if (guest && !guest.webContents.isDestroyed()) guest.webContents.close()
    if (window && !window.isDestroyed()) window.destroy()
    await new Promise((resolve) => (server.listening ? server.close(resolve) : resolve()))
    try {
      fs.rmSync(profile, { recursive: true, force: true })
    } catch {
      /* Files can remain locked until process exit. */
    }
    console.log(
      `Electron ${report.electron}: native WebMCP ${enabled ? "enabled" : "disabled"} ${report.passed ? "passed" : "failed"}`,
    )
    app.exit(report.passed ? 0 : 1)
  })
