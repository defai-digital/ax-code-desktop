const { app, BrowserWindow, protocol } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const repo = '/Users/akiralam/code/ax-coder-old'
const rendererProtocol = require(`${repo}/desktop/packages/electron/src/desktop-renderer-protocol.js`)
protocol.registerSchemesAsPrivileged(rendererProtocol.PACKAGED_RENDERER_PRIVILEGED_SCHEMES)
const output = process.env.AX_PERF_EVIDENCE
const dist = process.env.AX_PERF_DIST
if (!output || !dist) throw new Error('AX_PERF_EVIDENCE and AX_PERF_DIST are required')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ax-coder-code-viewport-')))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  protocol.handle('app', rendererProtocol.createPackagedRendererProtocolHandler({
    webDistPath: dist, readFile: file => fs.promises.readFile(file), getApiOrigin: () => '',
  }))
  const results = []
  for (const kind of ['file', 'diff'].filter(kind => !process.env.AX_PERF_SCENARIO || process.env.AX_PERF_SCENARIO === kind)) {
    const win = new BrowserWindow({ width: 1440, height: 1000, show: true, webPreferences: {
      nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
    } })
    const evaluate = expression => win.webContents.executeJavaScript(expression)
    await win.loadURL('app://ax-code/perf/renderer.html')
    await pause(1000)
    await evaluate(`codeFixture.setup(${JSON.stringify(kind)})`)
    await pause(4000)
    await evaluate('codeFixture.start()')
    const keys = setInterval(() => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A' })
      win.webContents.sendInputEvent({ type: 'char', keyCode: 'a' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A' })
    }, 150)
    await pause(12000)
    clearInterval(keys)
    await pause(300)
    const result = await evaluate('codeFixture.stop()')
    result.initialScrollTop = await evaluate(`document.querySelector('[data-tool-code-viewport] > div:last-child')?.scrollTop ?? 0`)
    fs.writeFileSync(path.join(output, 'partial-results.json'), JSON.stringify([...results, result], null, 2))
    if (process.env.AX_PERF_EXPECT_TOP === '1' && result.initialScrollTop !== 0) throw new Error('Code viewport did not start at the first line')
    for (const [position, marker] of [[0, 'fixture1 ='], [.5, 'fixture2000 =']]) {
      await evaluate(`(() => {const e=document.querySelector('[data-tool-code-viewport] > div:last-child') ?? document.querySelector('.tool-output-surface.h-full');e.scrollTop=${position}*e.scrollHeight})()`)
      await pause(700)
      const visible = await evaluate(`(() => {let text='';for(const e of document.querySelectorAll('diffs-container'))for(const code of e.shadowRoot?.querySelectorAll('[data-code]') ?? [])text+=code.textContent;return text.includes(${JSON.stringify(marker)})})()`)
      if (!visible) {
        await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, `${kind}-failed-position.png`), image.toPNG()))
        console.log(await evaluate(`(() => {const host=document.querySelector('diffs-container');const viewport=document.querySelector('[data-tool-code-viewport] > div:last-child');return {scrollTop:viewport?.scrollTop,height:viewport?.scrollHeight,text:host?.shadowRoot?.textContent?.slice(-1500),html:host?.outerHTML.slice(0,500)}})()`))
        throw new Error(`${kind} source position ${position} is missing`)
      }
    }
    result.topAndMiddleCheck = true
    await evaluate('codeFixture.scrollBottom()')
    await pause(700)
    result.bottom = await evaluate('codeFixture.shadowState()')
    if (kind === 'diff') {
      await evaluate(`document.querySelector('button[title="Switch to side-by-side view"]').click()`)
      await pause(500)
      await evaluate('codeFixture.scrollBottom()')
      await pause(700)
      result.sideBySide = await evaluate('codeFixture.shadowState()')
      result.afterModeWorkers = await evaluate('codeFixture.stop().workers')
      if (!result.sideBySide.finalRowMounted) throw new Error('Diff mode switch lost the final row')
    }
    result.electron = process.versions.electron
    result.chrome = process.versions.chrome
    await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, `${kind}-bottom.png`), image.toPNG()))
    results.push(result)
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(result))
    if (!result.bottom.finalRowMounted || result.errors.length || result.receivedKeys !== result.inputCharacters) {
      throw new Error(`${kind} content, input, or renderer validation failed`)
    }
    win.close()
  }
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
