const { app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const http = require("node:http")
const dist = process.env.AX_UIUX_DIST || "/tmp/ax-code-supervision-v2-renderer"
const output = process.env.AX_UIUX_EVIDENCE || "/tmp/ax-code-supervision-v2-baseline"
fs.mkdirSync(output, { recursive: true })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-supervision-v2-"))
app.setPath("userData", profile)
app.on("window-all-closed", () => {})
const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
app
  .whenReady()
  .then(async () => {
    const server = http.createServer((req, res) => {
      const file = path.resolve(dist, "." + new URL(req.url, "http://127.0.0.1").pathname)
      if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end()
        return
      }
      res.setHeader(
        "Content-Type",
        { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(file)] ||
          "application/octet-stream",
      )
      fs.createReadStream(file).pipe(res)
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const results = []
    const focusCase = process.env.AX_UIUX_FOCUS_CASE === "1"
    for (const width of focusCase ? [420] : [420, 760, 1440]) {
      for (const zoom of focusCase ? [2] : [1, 2]) {
        for (const density of focusCase ? ["comfortable"] : ["comfortable", "compact"]) {
          for (const locale of focusCase ? ["de"] : ["en", "de"]) {
            const win = new BrowserWindow({
              width,
              height: 1000,
              useContentSize: true,
              show: false,
              webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
            })
            await win.loadURL(`http://127.0.0.1:${server.address().port}/renderer.html`)
            win.webContents.setZoomFactor(zoom)
            const evaluate = (script) => win.webContents.executeJavaScript(script)
            for (
              let n = 0;
              n < 40 &&
              !(await evaluate("Boolean(window.uiuxFixture && document.querySelector('[data-request-kind]'))"));
              n++
            )
              await pause()
            await evaluate(`uiuxFixture.density(${JSON.stringify(density)})`)
            await evaluate(`uiuxFixture.locale(${JSON.stringify(locale)})`)
            await pause()
            await evaluate("document.querySelector('[data-request-kind] button[aria-expanded]').click()")
            await pause()
            const measured = await evaluate(`(() => {
        const card = document.querySelector('[data-request-kind]');
        const peek = card.parentElement.parentElement;
        const board = document.querySelector('.mission-control-board');
        return { viewport: innerWidth, pixelRatio: devicePixelRatio, boardWidth: board.clientWidth, peekWidth: peek.clientWidth,
          peekOverflow: peek.scrollWidth > peek.clientWidth, cardWidth: card.clientWidth,
          cardOverflow: card.scrollWidth > card.clientWidth, leftPadding: getComputedStyle(peek).paddingLeft,
          bodyOverflow: document.body.scrollWidth > innerWidth,
          actions: Array.from(card.querySelectorAll('button')).map(b => ({text:b.textContent, width:b.getBoundingClientRect().width})) };
      })()`)
            await evaluate(
              `(() => { const button=document.querySelector('[data-request-kind]').querySelectorAll('button')[1]; button.focus(); button.scrollIntoView({block:'center',inline:'nearest'}); })()`,
            )
            win.webContents.focus()
            win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" })
            win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" })
            await pause()
            const keyboard = await evaluate(`(() => {
        const card=document.querySelector('[data-request-kind]'); const deny=card.querySelectorAll('button')[2];
        const rect=deny.getBoundingClientRect(); const center=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        return {denyFocused:document.activeElement===deny,focusVisible:deny.matches(':focus-visible'),reachable:Boolean(center&&(center===deny||deny.contains(center))),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
      })()`)
            if (focusCase) await win.webContents.capturePage().then((image) => fs.writeFileSync(path.join(output, "keyboard-focus.png"), image.toPNG()))
            if (
              process.env.AX_UIUX_ASSERT === "1" &&
              (measured.peekOverflow ||
                measured.cardOverflow ||
                !keyboard.denyFocused ||
                !keyboard.reachable ||
                !keyboard.focusVisible)
            )
              throw Error(JSON.stringify({ width, zoom, density, locale, measured, keyboard }))
            win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" })
            win.webContents.sendInputEvent({ type: "char", keyCode: "\r" })
            win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" })
            await pause()
            const accepted = await evaluate(
              `(() => { const card=document.querySelector('[data-request-kind]');return card.dataset.requestStatus==='accepted'&&card.querySelectorAll('button')[1].disabled&&card.querySelectorAll('button')[2].disabled; })()`,
            )
            if (process.env.AX_UIUX_ASSERT === "1" && !accepted)
              throw Error(
                JSON.stringify({
                  error: "Keyboard response was not locked",
                  width,
                  zoom,
                  density,
                  locale,
                  status: await evaluate("document.querySelector('[data-request-kind]').dataset.requestStatus"),
                  focused: await evaluate("document.activeElement.outerHTML"),
                }),
              )
            const acceptedOverflow = await evaluate(
              "(() => { const card=document.querySelector('[data-request-kind]'); return card.scrollWidth>card.clientWidth; })()",
            )
            if (process.env.AX_UIUX_ASSERT === "1" && acceptedOverflow)
              throw Error(JSON.stringify({ error: "Accepted status overflow", width, zoom, density, locale }))
            if (density === "comfortable")
              await win.webContents
                .capturePage()
                .then((image) =>
                  fs.writeFileSync(path.join(output, `${width}-zoom-${zoom}-${locale}.png`), image.toPNG()),
                )
            await evaluate("uiuxFixture.labels(true)")
            await pause()
            const inspector = await evaluate(`(() => {
        const rail=document.querySelector('[data-inspector-rail]'); const toggle=rail.querySelector('button');
        toggle.focus();
        return {expanded:rail.dataset.expanded==='true',controlCount:rail.querySelectorAll('button[aria-pressed]').length,caption:toggle.textContent,overflow:rail.scrollWidth>rail.clientWidth,chatWidth:document.querySelector('.fixture-chat').clientWidth,position:getComputedStyle(rail).position};
      })()`)
            if (density === "comfortable" && locale === "en" && zoom === 1)
              await win.webContents
                .capturePage()
                .then((image) => fs.writeFileSync(path.join(output, `${width}-inspector.png`), image.toPNG()))
            win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" })
            win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" })
            await pause()
            const inspectorEscape = await evaluate(
              "(() => { const rail=document.querySelector('[data-inspector-rail]');return rail.dataset.expanded==='false'&&document.activeElement===rail.querySelector('button'); })()",
            )
            if (
              process.env.AX_UIUX_ASSERT === "1" &&
              (!inspector.expanded ||
                inspector.controlCount !== 8 ||
                inspector.overflow ||
                inspector.chatWidth < Math.min(200, measured.viewport - 52) ||
                !inspectorEscape)
            )
              throw Error(
                JSON.stringify({
                  error: "Inspector qualification failed",
                  width,
                  zoom,
                  density,
                  locale,
                  inspector,
                  inspectorEscape,
                }),
              )
            results.push({
              width,
              zoom,
              density,
              locale,
              ...measured,
              keyboard,
              accepted,
              acceptedOverflow,
              inspector,
              inspectorEscape,
            })
            win.destroy()
          }
        }
      }
    }
    fs.writeFileSync(
      path.join(output, "measurements.json"),
      JSON.stringify({ electron: process.versions.electron, results }, null, 2),
    )
    console.log(JSON.stringify(results))
    server.close()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
