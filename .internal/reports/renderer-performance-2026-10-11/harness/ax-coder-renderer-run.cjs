const { app, BrowserWindow, contentTracing, protocol } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const os = require('node:os')
const output = process.env.AX_PERF_EVIDENCE || '/tmp/ax-coder-renderer-evidence-final'
const dist = process.env.AX_PERF_DIST || '/tmp/ax-coder-renderer-dist'
const packagedProtocol = process.env.AX_PERF_PACKAGED_PROTOCOL === '1'
const rendererProtocol = packagedProtocol
  ? require('/Users/akiralam/code/ax-coder-old/desktop/packages/electron/src/desktop-renderer-protocol.js')
  : null
if (rendererProtocol) protocol.registerSchemesAsPrivileged(rendererProtocol.PACKAGED_RENDERER_PRIVILEGED_SCHEMES)
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ax-coder-perf-profile-')))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const server = http.createServer((req, res) => {
  const name = path.resolve(dist, '.' + decodeURIComponent(req.url.split('?')[0]))
  if (!name.startsWith(dist + '/')) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(name)) { res.writeHead(404); return res.end() }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html')
  fs.createReadStream(name).pipe(res)
})
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  if (rendererProtocol) protocol.handle('app', rendererProtocol.createPackagedRendererProtocolHandler({
    webDistPath: dist, readFile: name => fs.promises.readFile(name), getApiOrigin: () => '',
  }))
  const win = new BrowserWindow({ width: 1440, height: 1000, show: true, webPreferences: {
    nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, level, message) => console.log('renderer:', message))
  win.webContents.on('render-process-gone', (_event, detail) => console.log('RENDERER GONE', detail))
  await win.loadURL(packagedProtocol ? 'app://ax-code/perf/renderer.html' : `http://127.0.0.1:${server.address().port}/perf/renderer.html`)
  const evaluate = expression => win.webContents.executeJavaScript(expression)
  await pause(1500)
  win.webContents.debugger.attach("1.3")
  await win.webContents.debugger.sendCommand("Profiler.enable")
  const results = []
  for (const scenario of [
    { name: 'idle-200', messages: 200, kind: 'markdown', idle: true },
    { name: 'markdown-200', messages: 200, kind: 'markdown' },
    { name: 'markdown-4000', messages: 4000, kind: 'markdown' },
    { name: 'paragraph-4000', messages: 4000, kind: 'paragraph' },
    { name: 'tool-4000', messages: 4000, kind: 'tool' },
    { name: 'tool-expanded-4000', messages: 4000, kind: 'tool', expanded: true },
  ].filter(scenario => !process.env.AX_PERF_SCENARIO || process.env.AX_PERF_SCENARIO.split(",").includes(scenario.name))) {
    console.log('SETUP', scenario.name)
    await evaluate(`perfFixture.setup(${JSON.stringify(scenario)})`)
    await pause(4000)
    if (scenario.expanded) console.log('EXPAND', await evaluate(`(() => {
      const node = [...document.querySelectorAll('[role=button]')].find(e => /Shell Command/.test(e.textContent));
      if (!node) throw new Error('Tool expander missing'); node.click(); return node.textContent
    })()`))
    for (let i = 0; i < 3; i++) {
      await evaluate(`(() => {const e=document.querySelector('[data-scrollbar=chat]');e.scrollTop=e.scrollHeight})()`)
      await pause(150)
    }
    console.log('DOM', await evaluate(`({text:document.body.innerText.slice(0,400), textarea:!!document.querySelector('textarea'),scroll:(()=>{const e=document.querySelector('[data-scrollbar=chat]');return {top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight}})()})`))
    if (!await evaluate(`!!document.querySelector('textarea')`)) throw new Error('Actual ChatInput did not mount')
    await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, scenario.name + '.png'), image.toPNG()))
    await contentTracing.startRecording({ included_categories: ['devtools.timeline','disabled-by-default-devtools.timeline','v8','blink.user_timing'] })
    await win.webContents.debugger.sendCommand('Profiler.start')
    console.log('START', await evaluate('perfFixture.start()'))
    const startChars = await evaluate(`document.querySelector('textarea').value.length`)
    const keys = setInterval(() => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A' })
      win.webContents.sendInputEvent({ type: 'char', keyCode: 'a' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A' })
    }, 150)
    await pause(12000)
    clearInterval(keys)
    await pause(300)
    const result = await evaluate('perfFixture.stop()')
    const profile = await win.webContents.debugger.sendCommand('Profiler.stop')
    fs.writeFileSync(path.join(output, scenario.name + '.cpuprofile'), JSON.stringify(profile.profile))
    await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, scenario.name + '-after.png'), image.toPNG()))
    result.inputCharactersAdded = result.inputCharacters - startChars
    result.electron = process.versions.electron
    result.chrome = process.versions.chrome
    if (scenario.expanded && result.virtualizedToolViews) {
      await evaluate(`(() => {const e=document.querySelector('[data-tool-output="virtualized"] [role="region"]');e.scrollTop=e.scrollHeight})()`)
      await pause(300)
      result.outputBottomCheck = await evaluate(`({finalRowVisible:document.body.innerText.includes('final row 4000 complete'),mountedRows:document.querySelectorAll('[data-tool-output-line]').length})`)
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, scenario.name + '-bottom.png'), image.toPNG()))
      if (!result.outputBottomCheck.finalRowVisible || result.outputBottomCheck.mountedRows > 100) throw new Error('Large output scroll check failed')
    }
    results.push(result)
    await contentTracing.stopRecording(path.join(output, scenario.name + '.trace.json'))
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
    console.log('RESULT', JSON.stringify(result))
  }
  win.close(); server.close(); app.quit()
}).catch(error => { console.error(error); server.close(); app.exit(1) })
