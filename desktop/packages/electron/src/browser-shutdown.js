"use strict"

class BrowserClosureRefusedError extends Error {
  constructor(pages) {
    super("Project browser pages refused closure")
    this.name = "BrowserClosureRefusedError"
    this.code = "BROWSER_CLOSURE_REFUSED"
    this.pages = pages
  }
}

async function requireBrowserClosure(browser) {
  const pages = await browser.closeAll()
  if (pages?.length) throw new BrowserClosureRefusedError(pages)
}

async function restartDesktop(app, shutdown) {
  await shutdown()
  app.relaunch()
  app.exit(0)
}

module.exports = { BrowserClosureRefusedError, requireBrowserClosure, restartDesktop }
