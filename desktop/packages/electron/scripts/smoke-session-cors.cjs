"use strict"
// Exercise the pinned SDK's session creation through a real packaged-origin renderer.
const { app, BrowserWindow, protocol } = require("electron")
const path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict")
const { pathToFileURL } = require("node:url")
const { PACKAGED_RENDERER_PRIVILEGED_SCHEMES } = require("../src/desktop-renderer-protocol")
const profile = process.env.AX_SESSION_CORS_PROFILE_DIR
assert.ok(profile && path.isAbsolute(profile), "The smoke wrapper must provide an isolated profile")
app.setPath("userData", profile)
app.commandLine.appendSwitch("use-mock-keychain")
protocol.registerSchemesAsPrivileged(PACKAGED_RENDERER_PRIVILEGED_SCHEMES)
let server, window
const timeout = setTimeout(() => app.exit(1), 20000)
app
  .whenReady()
  .then(async () => {
    const { applyPackagedRendererCorsHeaders } = await import(
      pathToFileURL(path.resolve(__dirname, "../../web/server/lib/security/response-headers.js"))
    )
    const sdkPath = require.resolve("@defai-digital/ax-code-sdk/v2/client", {
      paths: [path.resolve(__dirname, "../../ui")],
    })
    const { createAxCodeClient } = await import(pathToFileURL(sdkPath))
    let broken = true,
      posts = 0
    server = http.createServer((req, res) => {
      applyPackagedRendererCorsHeaders(req, res)
      if (broken) res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
      if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
      }
      if (req.method === "POST" && req.url.startsWith("/api/session")) {
        posts++
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ id: "ses_diagnostic_cors" }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    protocol.handle(
      "app",
      () =>
        new Response("<!doctype html><title>Session CORS test</title>", { headers: { "Content-Type": "text/html" } }),
    )
    window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })
    await window.loadURL("app://ax-code/")
    const transport = async (request) => {
      const init = { method: request.method, headers: Object.fromEntries(request.headers) }
      if (!["GET", "HEAD"].includes(request.method)) init.body = await request.text()
      const result = await window.webContents.executeJavaScript(
        `fetch(${JSON.stringify(request.url)},${JSON.stringify(init)}).then(async r=>({status:r.status,body:await r.text()}))`,
      )
      return new Response(result.body, { status: result.status, headers: { "Content-Type": "application/json" } })
    }
    const client = createAxCodeClient({
      baseUrl: `http://127.0.0.1:${server.address().port}/api`,
      directory: profile,
      fetch: transport,
    })
    const before = await client.session.create({ title: "CORS diagnostic" })
    assert.ok(before.error, "Legacy header policy must reproduce the SDK request failure")
    assert.equal(posts, 0, "Blocked preflight must not reach session creation")
    broken = false
    const after = await client.session.create({ title: "CORS diagnostic" })
    assert.equal(after.error, undefined)
    assert.equal(after.data.id, "ses_diagnostic_cors")
    assert.equal(posts, 1)
    console.log(
      "SESSION_CORS_OK: pinned SDK fails with legacy CORS and succeeds with scoped directory headers in real Chromium",
    )
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    clearTimeout(timeout)
    window?.destroy()
    if (server) await new Promise((resolve) => server.close(resolve))
    app.exit(process.exitCode || 0)
  })
