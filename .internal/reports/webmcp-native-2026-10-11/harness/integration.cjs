// Controlled native integration peer for the AX Code source contract test.
// All credentials are ephemeral process environment data and never printed or saved.
const { app, BrowserWindow, WebContentsView, session, webContents } = require('electron')
const { createDesktopWebMcpBrowser } = require('../../../../desktop/packages/electron/src/desktop-webmcp-browser')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.commandLine.appendSwitch('enable-features', 'WebMCP')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-coder-webmcp-integration-'))
app.setPath('userData', profile)
const fixture = `<!doctype html><title>Native integration fixture</title>
<form toolname="form_echo" tooldescription="Echo a fixture value" toolautosubmit>
<input name="value" required><button>Submit</button></form>
<form id="manual" toolname="manual_echo" tooldescription="Echo after manual fixture submission">
<input name="value" required><button>Submit manually</button></form>
<script>
document.modelContext.registerTool({name:'echo',description:'Echo a fixture value',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value']},execute:async({value})=>({value})});
document.modelContext.registerTool({name:'wait',description:'Wait until canceled',inputSchema:{type:'object'},execute:()=>new Promise(()=>{})});
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();event.respondWith(Promise.resolve({value:event.target.elements.value.value,agentInvoked:event.agentInvoked}));});
document.querySelector('#manual').addEventListener('submit',event=>{event.preventDefault();event.respondWith(Promise.resolve({value:event.target.elements.value.value,agentInvoked:event.agentInvoked}));});
</script>`
const server = http.createServer((_req, res) => {res.setHeader('Content-Type','text/html');res.end(fixture)})
let owner, manager
const timeout = setTimeout(() => app.exit(1), 40000)
const finish = async code => {
  clearTimeout(timeout)
  await manager?.closeAll()
  owner?.destroy()
  await new Promise(resolve => server.listening ? server.close(resolve) : resolve())
  fs.rmSync(profile,{recursive:true,force:true})
  app.exit(code)
}
app.whenReady().then(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  owner = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  console.log('NATIVE_OWNER_READY')
  manager = createDesktopWebMcpBrowser({BrowserWindow,WebContentsView,session,
    getRuntime:()=>process.env.AX_TEST_BROWSER_ORIGIN,getAuthorization:()=>'',providerToken:process.env.AX_TEST_BROWSER_TOKEN})
  const status = await manager.command(owner.webContents,{action:'create',directory:process.env.AX_TEST_BROWSER_DIRECTORY,
    sessionID:process.env.AX_TEST_BROWSER_SESSION,url:`http://127.0.0.1:${server.address().port}`})
  console.log('NATIVE_VIEW_READY')
  await manager.command(owner.webContents,{action:'bounds',id:status.id,x:0,y:0,width:500,height:400})
  console.log('NATIVE_BOUNDS_READY')
  owner.showInactive()
  await manager.command(owner.webContents,{action:'enable',id:status.id})
  console.log('NATIVE_BROWSER_READY')
  const readline = require('node:readline').createInterface({input:process.stdin})
  readline.on('line',line=>{
    // Fixed fixture-only submission; production never evaluates page JavaScript.
    if(line==='submit') {
      const guest = webContents.getAllWebContents().find(contents=>contents.getURL()===`http://127.0.0.1:${server.address().port}/`)
      void guest.executeJavaScript("document.querySelector('#manual').requestSubmit()")
    }
    if(line==='reload') void manager.command(owner.webContents,{action:'reload',id:status.id}).then(()=>console.log('NATIVE_BROWSER_RELOADED'))
    if(line==='hide') owner.hide()
    if(line==='stop') {readline.close();void finish(0)}
  })
}).catch(()=>{console.error('Native integration peer failed');void finish(1)})
