// Research-only native capability probe. Never loaded by the desktop app.
// Runs a controlled loopback fixture in a disposable, sandboxed Electron profile.
const { app, BrowserWindow, WebContentsView } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const enabled = process.argv.includes('--probe-webmcp')
if (enabled) app.commandLine.appendSwitch('enable-features', 'WebMCP')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-coder-webmcp-probe-'))
app.setPath('userData', profile)
const report = {
  schema: 'ax-coder.webmcp-native-probe.v1',
  timestamp: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  webmcpFeatureEnabled: enabled,
  installedChromeUsed: false,
  remoteDebuggingPortUsed: false,
  researchOnly: true,
  surface: 'WebContentsView',
}
const fixture = `<!doctype html><meta charset="utf-8"><title>WebMCP native probe</title>
<form toolname="probe_form" tooldescription="Return a controlled probe value" toolautosubmit>
<label>Value <input name="value" required></label><button type="submit">Submit</button></form>
<script>
globalThis.probe = { api: document.modelContext ? 'document' : navigator.modelContext ? 'navigator' : null,
  secureContext: isSecureContext, registered: false, submissions: 0, executions: 0 };
globalThis.registrationController = new AbortController();
const context = document.modelContext || navigator.modelContext;
if (context) {
  try {
    context.registerTool({ name: 'probe_echo', description: 'Return a controlled probe value',
      inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
      execute: async ({ value }) => { probe.executions++; return { value }; }
    }, { signal: registrationController.signal });
    probe.registered = true;
  } catch (error) { probe.registrationError = String(error); }
}
document.querySelector('form').addEventListener('submit', event => {
  event.preventDefault(); probe.submissions++;
  probe.agentInvoked = event.agentInvoked;
  if (typeof event.respondWith === 'function') {
    event.respondWith(Promise.resolve({ value: event.target.elements.value.value }));
  }
});
</script>`
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(req.url === '/empty' ? '<!doctype html><title>Empty probe document</title>' : fixture)
})
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const events = []
let win
let view
let status = 0
const timeout = setTimeout(() => {
  console.error('Native probe exceeded 25 seconds')
  app.exit(1)
}, 25000)

async function run() {
  await app.whenReady()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  win = new BrowserWindow({ show: false, webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false,
    webSecurity: true, partition: 'ax-coder-webmcp-probe',
  } })
  view = new WebContentsView({ webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false,
    webSecurity: true, partition: 'ax-coder-webmcp-probe-guest',
  } })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 })
  const contents = view.webContents
  await contents.loadURL(origin)
  // Fixed code is used only against this local fixture, never against user pages.
  report.fixture = await contents.executeJavaScript('({...probe, nodeVisible: typeof process !== "undefined"})')
  contents.debugger.attach('1.3')
  contents.debugger.on('message', (_event, method, params) => {
    if (method.startsWith('WebMCP.')) events.push({ method, params })
  })
  try {
    await contents.debugger.sendCommand('WebMCP.enable')
    report.nativeDomainAvailable = true
  } catch (error) {
    report.nativeDomainAvailable = false
    report.nativeDomainError = String(error.message)
  }
  await pause(200)
  const tools = events.filter(event => event.method === 'WebMCP.toolsAdded')
    .flatMap(event => event.params.tools)
  report.tools = tools.map(({ name, frameId, inputSchema }) => ({ name, frameId, inputSchema }))
  report.invocations = []
  for (const name of ['probe_echo', 'probe_form']) {
    const tool = tools.find(tool => tool.name === name)
    if (!tool) continue
    try {
      const invocation = await contents.debugger.sendCommand('WebMCP.invokeTool', {
        frameId: tool.frameId, toolName: name, input: { value: 'native-probe-value' },
      })
      const deadline = Date.now() + 3000
      let response
      while (!response && Date.now() < deadline) {
        response = events.find(event => event.method === 'WebMCP.toolResponded' &&
          event.params.invocationId === invocation.invocationId)
        if (!response) await pause(25)
      }
      if (!response) {
        report.invocations.push({ name, status: 'timeout', invocationId: invocation.invocationId })
        await contents.debugger.sendCommand('WebMCP.cancelInvocation', invocation).catch(() => {})
      } else report.invocations.push({ name, ...response.params })
    } catch (error) {
      report.invocations.push({ name, status: 'error', error: String(error.message) })
    }
  }
  report.fixtureAfterInvocation = await contents.executeJavaScript('({...probe})')
  const removalStart = events.length
  await contents.executeJavaScript('registrationController.abort(); document.querySelector("form").removeAttribute("toolname")')
  await pause(100)
  report.removalEvents = events.slice(removalStart).filter(event => event.method === 'WebMCP.toolsRemoved')
  await contents.loadURL(`${origin}/empty`)
  const reloadStart = events.length
  if (report.nativeDomainAvailable) {
    await contents.debugger.sendCommand('WebMCP.disable')
    await contents.debugger.sendCommand('WebMCP.enable')
  }
  await pause(100)
  report.emptyDocumentTools = events.slice(reloadStart)
    .filter(event => event.method === 'WebMCP.toolsAdded').flatMap(event => event.params.tools)
  report.nativeSmokePassed = report.fixture.api === 'document' &&
    report.fixture.secureContext && !report.fixture.nodeVisible &&
    report.invocations.length === 2 &&
    report.invocations.every(result => result.status === 'Completed' &&
      result.output?.value === 'native-probe-value') &&
    report.fixtureAfterInvocation.executions === 1 &&
    report.fixtureAfterInvocation.submissions === 1 &&
    report.fixtureAfterInvocation.agentInvoked === true &&
    ['probe_echo', 'probe_form'].every(name => report.removalEvents.some(event =>
      event.params.tools.some(tool => tool.name === name))) &&
    report.emptyDocumentTools.length === 0
  report.productionQualified = false
  const outputArg = process.argv.find(arg => arg.startsWith('--probe-output='))
  if (outputArg) fs.writeFileSync(path.resolve(outputArg.slice('--probe-output='.length)), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (process.argv.includes('--probe-expect-native') && !report.nativeSmokePassed) {
    throw new Error('The selected engine did not pass the native WebMCP smoke')
  }
}

run().catch(error => { console.error(error); status = 1 }).finally(async () => {
  clearTimeout(timeout)
  if (view && !view.webContents.isDestroyed()) view.webContents.close()
  if (win && !win.isDestroyed()) win.destroy()
  await new Promise(resolve => server.listening ? server.close(resolve) : resolve())
  // Electron may hold profile files until exit. Delete only this probe's unique profile.
  try { fs.rmSync(profile, { recursive: true, force: true }) }
  catch (error) { console.error('Could not remove the disposable probe profile:', error.message) }
  app.exit(status)
})
