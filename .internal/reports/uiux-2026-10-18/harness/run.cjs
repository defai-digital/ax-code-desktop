const { app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const http = require("node:http")
const dist = process.env.AX_UIUX_DIST || "/tmp/ax-code-uiux-renderer-dist"
const output = process.env.AX_UIUX_EVIDENCE || "/tmp/ax-code-uiux-20261018/visual"
fs.mkdirSync(output, { recursive: true })
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-uiux-profile-")))
const delay = () => new Promise((resolve) => setTimeout(resolve, 180))
app
  .whenReady()
  .then(async () => {
    const server = http.createServer((req, res) => {
      const file = path.resolve(dist, "." + new URL(req.url, "http://127.0.0.1").pathname)
      if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end()
        return
      }
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }
      res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream")
      fs.createReadStream(file).pipe(res)
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const results = []
    for (const width of [420, 760, 1440]) {
      for (const density of ["comfortable", "compact"]) {
        const errors = []
        const win = new BrowserWindow({
          width,
          height: 1000,
          show: false,
          webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
        })
        win.webContents.on("console-message", (event) => {
          if (event.level === "error") errors.push(event.message)
          console.log("renderer:", event.level, event.message)
        })
        const evaluate = (expression) =>
          win.webContents.executeJavaScript(expression).catch((error) => {
            console.error("Evaluation failed:", expression, errors)
            throw error
          })
        await win.loadURL(`${origin}/renderer.html`)
        for (
          let i = 0;
          i < 30 && !(await evaluate('Boolean(window.uiuxFixture && document.querySelector(".mission-control-row"))'));
          i++
        )
          await delay()
        await evaluate('uiuxFixture.locale("en")')
        await evaluate(`uiuxFixture.density(${JSON.stringify(density)})`)
        await delay()
        const before = await evaluate(
          `(() => { const board=document.querySelector('.mission-control-board');const row=document.querySelector('.mission-control-row');return {bodyOverflow:document.body.scrollWidth>innerWidth,boardOverflow:board.scrollWidth>board.clientWidth,rowOverflow:row.scrollWidth>row.clientWidth,projectVisible:!!document.querySelector('.mission-project')?.getBoundingClientRect().width,rows:document.querySelectorAll('[data-supervision-state]').length}; })()`,
        )
        if (
          before.bodyOverflow ||
          before.boardOverflow ||
          before.rowOverflow ||
          !before.projectVisible ||
          before.rows !== 6
        )
          throw Error(JSON.stringify({ width, density, before }))
        await evaluate(`document.querySelector('[data-request-kind] button[aria-expanded]').click()`)
        await delay()
        const scopes = await evaluate(
          `Array.from(document.querySelectorAll('[data-request-kind] li')).map(x=>x.textContent)`,
        )
        if (scopes.length !== 3 || !scopes[2].endsWith("**")) throw Error("Scope disclosure lost content")
        await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        await win.webContents
          .capturePage()
          .then((image) => fs.writeFileSync(path.join(output, `${width}-${density}.png`), image.toPNG()))
        await evaluate("uiuxFixture.labels(true)")
        await delay()
        const rail = await evaluate(
          `(() => { const rail=document.querySelector('[data-inspector-rail]');return {expanded:rail.dataset.expanded,buttons:rail.querySelectorAll('[aria-pressed]').length,chatWidth:document.querySelector('.fixture-chat').getBoundingClientRect().width,bodyOverflow:document.body.scrollWidth>innerWidth}; })()`,
        )
        if (rail.expanded !== "true" || rail.buttons !== 8 || rail.chatWidth < 200 || rail.bodyOverflow)
          throw Error(JSON.stringify({ width, rail }))
        await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        if (density === "comfortable")
          await win.webContents
            .capturePage()
            .then((image) => fs.writeFileSync(path.join(output, `${width}-tools.png`), image.toPNG()))
        if (width === 420 && density === "comfortable") {
          await evaluate('uiuxFixture.locale("de")')
          await delay()
          const localized = await evaluate(
            `(() => { const rail=document.querySelector('[data-inspector-rail]');return {overflow:rail.scrollWidth>rail.clientWidth,label:rail.querySelector('button[aria-expanded]').getAttribute('aria-label')};})()`,
          )
          if (localized.overflow || !localized.label.includes("Werkzeuge")) throw Error(JSON.stringify(localized))
          await win.webContents
            .capturePage()
            .then((image) => fs.writeFileSync(path.join(output, "420-tools-de.png"), image.toPNG()))
          await evaluate(
            `document.querySelector('[data-inspector-rail] button[aria-expanded]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
          )
          await delay()
          if (await evaluate(`document.querySelector('[data-inspector-rail]').dataset.expanded !== 'false'`))
            throw Error("Escape did not collapse tools")
        }
        if (errors.length) throw Error(errors.join("\n"))
        results.push({ width, density, before, rail, errors })
        win.close()
      }
    }
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ electron: process.versions.electron, chrome: process.versions.chrome, results }, null, 2),
    )
    console.log(JSON.stringify(results))
    server.close()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
