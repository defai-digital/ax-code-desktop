const { app, BrowserWindow, session } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const http = require("node:http")
const net = require("node:net")
const crypto = require("node:crypto")
const { spawn } = require("node:child_process")
const root = path.resolve(__dirname, "../../../..")
const { attachDesktopBrowserWebviewPolicy } = require(path.join(root, "desktop/packages/electron/src/webview-policy.js"))
const python = process.env.AX_STREAMLIT_PYTHON || "/tmp/ax-code-streamlit-20261018-venv/bin/python"
const dist = process.env.AX_PREVIEW_DIST || "/tmp/ax-code-streamlit-project-renderer"
const output = process.env.AX_STREAMLIT_EVIDENCE || "/tmp/ax-code-streamlit-native-evidence"
const fixture = path.resolve(__dirname, "../../supervision-streamlit-2026-10-18/streamlit/app.py")
fs.mkdirSync(output, { recursive: true })
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-streamlit-profile-")))
app.on("window-all-closed", () => {})
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const children = new Set()
let host, win
const receipt = { platform:process.platform, arch:process.arch, electron:process.versions.electron, checks:[], errors:[] }
const record = (name, detail = {}) => { receipt.checks.push({name, ...detail}); console.log(name, JSON.stringify(detail)) }
async function until(fn, description, timeout = 20000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { if (await fn()) return } catch (error) { last = error.message }
    await pause(100)
  }
  throw Error(`${description} timed out${last ? ': '+last : ''}`)
}
async function port() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const value = server.address().port
  await new Promise(resolve => server.close(resolve))
  return value
}
async function start(project, targetPort) {
  const input = {id:project,name:project,interpreter:python,entrypoint:fixture,port:String(targetPort)}
  const command = await evaluate(`previewFixture.recipe(${JSON.stringify(input)}).then(result=>result.command)`)
  const child = spawn("/bin/zsh", ["-c", command], {
    cwd:path.dirname(fixture), env:{...process.env, AX_STREAMLIT_PROJECT:project, STREAMLIT_BROWSER_GATHER_USAGE_STATS:"false"}, detached:true, stdio:["ignore","pipe","pipe"],
  })
  children.add(child)
  const log = fs.createWriteStream(path.join(output, `${project}-server.log`), {flags:"a"})
  child.stdout.pipe(log); child.stderr.pipe(log)
  child.on("exit", () => { children.delete(child); log.end() })
  return child
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  process.kill(-child.pid, "SIGTERM")
  await until(() => child.exitCode !== null || child.signalCode !== null, "server stop", 5000).catch(() => process.kill(-child.pid, "SIGKILL"))
}
const evaluate = script => win.webContents.executeJavaScript(script)
async function guest() {
  const id = await evaluate("(() => { try { return document.querySelector('webview')?.getWebContentsId() } catch { return 0 } })()")
  return require("electron").webContents.fromId(id)
}
async function guestText() { return (await guest()).executeJavaScript("document.body.innerText") }
async function click(text) {
  await until(async () => (await guest()).executeJavaScript(`Array.from(document.querySelectorAll('button')).some(x=>x.innerText.trim()===${JSON.stringify(text)} && !x.disabled)`), `button ${text} ready`)
  await (await guest()).executeJavaScript(`(() => {const b = Array.from(document.querySelectorAll('button')).find(x=>x.innerText.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click()})()`, true)
}
async function mount(url, project = "alpha") {
  await evaluate(`previewFixture.mount(${JSON.stringify(url)}, ${JSON.stringify(project)})`)
  await until(async () => (await guestText()).includes(`Project: ${project}`), "Streamlit render")
}
async function upload(project) {
  const file = path.join(output, `${project}-upload.txt`)
  const bytes = `upload:${project}\n`
  fs.writeFileSync(file, bytes)
  await until(async () => (await guest()).executeJavaScript("Boolean(document.querySelector('input[type=\"file\"]'))"), "upload widget ready")
  const g = await guest()
  g.debugger.attach("1.3")
  try {
    const {root:doc} = await g.debugger.sendCommand("DOM.getDocument")
    const {nodeId} = await g.debugger.sendCommand("DOM.querySelector", {nodeId:doc.nodeId, selector:'input[type="file"]'})
    await g.debugger.sendCommand("DOM.setFileInputFiles", {nodeId, files:[file]})
  } finally { g.debugger.detach() }
  const hash = crypto.createHash("sha256").update(bytes).digest("hex")
  await until(async () => (await guestText()).includes(`Uploaded SHA256: ${hash}`), "upload content round trip")
  record(`upload-${project}`, {sha256:hash})
}
app.whenReady().then(async () => {
  const browserSession = session.fromPartition("persist:openchamber-browser")
  // Same deny-by-default ordinary-preview permission policy as main.js. This is not the Agent Browser.
  browserSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "fullscreen"))
  browserSession.setPermissionCheckHandler((_contents, permission) => permission === "fullscreen")
  const downloads=[]
  browserSession.on("will-download", (_event, item) => {
    const target = path.join(output, path.basename(item.getFilename()))
    item.setSavePath(target) // Supply the file destination a user normally chooses in the native save dialog.
    item.once("done", (_event, state) => downloads.push({target,state}))
  })
  host = http.createServer((req,res) => {
    const file = path.resolve(dist, "."+new URL(req.url,"http://127.0.0.1").pathname)
    if(!file.startsWith(path.resolve(dist)+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404).end();return}
    res.setHeader("Content-Type", {".html":"text/html",".js":"text/javascript",".css":"text/css",".wasm":"application/wasm"}[path.extname(file)] || "application/octet-stream")
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => host.listen(0,"127.0.0.1",resolve))
  win = new BrowserWindow({width:1100,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:true,backgroundThrottling:false}})
  attachDesktopBrowserWebviewPolicy(win.webContents)
  win.webContents.on("console-message", event => {if(event.level === "error") receipt.errors.push(event.message)})
  win.webContents.setWindowOpenHandler(({url}) => {record("external-open-request",{url});return {action:"deny"}})
  const p1=await port(), p2=await port()
  const u1=`http://127.0.0.1:${p1}/`, u2=`http://127.0.0.1:${p2}/`
  receipt.origins=[u1,u2]
  await win.loadURL(`http://127.0.0.1:${host.address().port}/preview.html`)
  await until(() => evaluate("Boolean(window.previewFixture)"), "preview harness ready")
  let alpha=await start("alpha",p1)
  await until(async () => (await fetch(u1+"_stcore/health")).ok,"server ready")
  await mount(u1,"alpha")
  await until(async () => (await guestText()).includes("Project: alpha"),"initial actual DesktopBrowserPane")
  record("core-render", { agentEnabled:await evaluate("previewFixture.agentEnabled()"), webPreferences:Object.fromEntries(Object.entries((await guest()).getLastWebPreferences()).filter(([key])=>["sandbox","contextIsolation","nodeIntegration","webSecurity","allowRunningInsecureContent","partition"].includes(key))) })
  await click("Increment")
  await until(async () => (await guestText()).includes("Count: 1"),"widget update")
  record("widget")
  await click("Submit form")
  await until(async () => (await guestText()).includes("Submitted: fixture message"),"form submit")
  record("form")
  await click("Stream text")
  await until(async () => { const t=await guestText(); return t.includes("FIRST") && !t.includes("COMPLETE") },"incremental stream")
  await until(async () => (await guestText()).includes("FIRST SECOND COMPLETE"),"stream completion")
  record("incremental-stream")
  await upload("alpha")
  await click("Download fixture")
  await until(() => downloads.length>0,"download")
  if(downloads[0].state!=="completed" || fs.readFileSync(downloads[0].target,"utf8")!=="download:alpha\n") throw Error("Download bytes differ")
  record("download-alpha", {contentVerified:true})
  await win.webContents.capturePage().then(image=>fs.writeFileSync(path.join(output,"alpha.png"),image.toPNG()))
  ;(await guest()).reload()
  await until(async () => (await guestText()).includes("Count: 0"),"reload/reset")
  record("reload",{sessionStateReset:true})
  const beta=await start("beta",p2)
  await until(async () => (await fetch(u2+"_stcore/health")).ok,"second server ready")
  await browserSession.cookies.set({url:u1,name:"ax_fixture_shared",value:"fixture",sameSite:"lax"})
  await mount(u2,"beta")
  record("two-projects",{sharedCookieObserved:(await browserSession.cookies.get({url:u2,name:"ax_fixture_shared"})).length===1})
  await upload("beta")
  await mount(u1,"alpha")
  await upload("alpha")
  const collision=await start("collision",p1)
  await until(() => collision.exitCode!==null,"port collision exit")
  if(collision.exitCode===0) throw Error("Port collision accepted")
  record("port-collision",{exitCode:collision.exitCode})
  await stop(alpha)
  await pause(500)
  alpha=await start("alpha",p1)
  await until(async () => (await fetch(u1+"_stcore/health")).ok,"restarted server ready")
  await until(async () => {await click("Increment");return (await guestText()).includes("Count: 1")},"WebSocket recovery",30000)
  record("server-restart-reconnect")
  await evaluate("previewFixture.hide()")
  if(!(await fetch(u1+"_stcore/health")).ok) throw Error("Hiding preview stopped server")
  record("hide-keeps-server")
  await mount(u1,"alpha")
  const dead=await port()
  await evaluate(`previewFixture.mount('http://127.0.0.1:${dead}/','offline')`)
  await until(async () => (await evaluate("document.body.innerText")).toLowerCase().includes("retry"),"load failure controls").catch(async () => {
    receipt.failurePaneText=await evaluate("document.body.innerText")
    if(!receipt.failurePaneText.toLowerCase().includes("retry")) throw Error("Missing retry control")
  })
  record("offline-retry-controls",{text:await evaluate("document.body.innerText")})
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.toLowerCase().includes('open')&&b.innerText.toLowerCase().includes('browser'))?.click()")
  await pause(250)
  if (receipt.errors.length) throw Error(receipt.errors.join("\n"))
  receipt.completed=true
}).catch(error => {receipt.failure=error.stack; console.error(error); process.exitCode=1}).finally(async () => {
  for(const child of [...children]) await stop(child)
  if(win && !win.isDestroyed()) win.destroy()
  if(host) host.close()
  fs.writeFileSync(path.join(output,"receipt.json"),JSON.stringify(receipt,null,2))
  app.exit(receipt.completed?0:1)
})
