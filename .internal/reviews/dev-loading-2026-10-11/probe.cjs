const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const root = process.cwd()
const { buildRendererApiOrigin } = require(path.join(root, 'desktop/packages/electron/src/desktop-renderer-protocol.js'))
const mode = process.env.AX_LOADING_PROBE_MODE
app.name = 'AX Development API Probe'
app.setPath('userData', fs.mkdtempSync(path.join(__dirname, 'profile-')))
process.env.AX_CODE_DESKTOP_RENDERER_API_ORIGIN = buildRendererApiOrigin(58850, mode === 'fixed' ? 'http://127.0.0.1:5173' : '')
const timer = setTimeout(() => app.exit(1), 25000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({show: false, webPreferences: {
    preload: path.join(root, 'desktop/packages/electron/dist/preload.js'),
    contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
  }})
  await win.loadURL('http://127.0.0.1:5173/@fs' + path.join(__dirname, 'probe.html'))
  const result = await win.webContents.executeJavaScript(`(async () => {
    const origin = window.__AX_CODE_DESKTOP_DESKTOP_SERVER__?.origin;
    const endpoints = ['/health', '/api/agent?directory=%2FUsers%2Fakiralam%2Fcode%2Fsdsa', '/api/config/providers?directory=%2FUsers%2Fakiralam%2Fcode%2Fsdsa'];
    const requests = await Promise.all(endpoints.map(async endpoint => {
      try {
        const response = await fetch(origin + endpoint);
        const payload = await response.json();
        return {endpoint, status: response.status, ...(endpoint === '/health' ? {ready: payload.isAxCodeReady} : Array.isArray(payload) ? {agents: payload.length} : {providers: payload.providers?.length, models: payload.providers?.reduce((n, p) => n + Object.keys(p.models ?? {}).length, 0)})};
      } catch (error) { return {endpoint, error: error.message}; }
    }));
    return {pageOrigin: location.origin, apiOrigin: origin, requests};
  })()`)
  console.log('AX_LOADING_PROBE_RESULT ' + JSON.stringify({mode, ...result}))
  const passed = mode === 'fixed' ? result.requests.every(r => r.status === 200) : result.requests.every(r => r.error === 'Failed to fetch')
  win.destroy()
  clearTimeout(timer)
  app.exit(passed ? 0 : 1)
}).catch(error => { console.error(error.message); app.exit(1) })
