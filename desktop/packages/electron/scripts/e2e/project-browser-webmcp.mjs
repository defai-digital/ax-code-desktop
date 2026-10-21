#!/usr/bin/env node
// WebMCP task suite W1 (discover) and W2 (try a tool by hand) against the public quickstart page, served on loopback.
// The page runs in the native project browser; no agent or model is involved.
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, "../../../../../docs/examples/webmcp-quickstart/index.html")
const EXPECTED_TOOLS = ["add_task", "complete_task", "list_tasks", "search_tasks"]

const args = parseArgs(process.argv.slice(2))
const fixture = await fs.readFile(fixturePath, "utf8")
const server = http.createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(fixture)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const pageUrl = `http://127.0.0.1:${server.address().port}/`

let outcome
try {
  outcome = await runHarness({
    ...args,
    uiWebMcp: true,
    journeys: [
      journeyBoot,
      async function journeyProjectBrowser({ session }) {
        const audit = new SettingsWebMcpAudit(session)
        await audit.client.enable()
        let actions = 0
        const act = async (step) => {
          actions += 1
          return step()
        }
        const capture = async (name) => {
          if (!args.artifacts) return
          await fs.mkdir(args.artifacts, { recursive: true })
          const state = await audit.all()
          const pane = await session.evaluate(
            `document.querySelector('[data-webmcp-tool-panel]')?.closest('section')?.parentElement?.innerText ?? ''`,
          )
          await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ state, pane }, null, 2))
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
        }
        const header = (await audit.all()).controls.find(
          (control) => control.role === "button" && control.name.startsWith("Project browser (WebMCP):"),
        )
        if (!header) throw new Error("Missing the WebMCP header control")
        await act(() => audit.client.call("ax_desktop_click", { ref: header.ref }))
        await audit.wait(`Boolean(document.querySelector('#webmcp-mode-tab-agent'))`, "project browser pane")
        await act(() => audit.click("Project browser (WebMCP)", { role: "tab" }))
        await act(() => audit.fill("Project browser address", pageUrl))
        // The native view starts asynchronously; Go stays disabled until it is ready.
        await audit.wait(
          `Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Go' && !b.disabled)`,
          "project browser ready",
        )
        await act(() => audit.click("Go", { role: "button" }))
        // W1: the page's tools are listed before any agent access is granted.
        await audit.wait(
          `document.querySelector('[data-webmcp-tool-panel]')?.textContent.includes('Page tools (${EXPECTED_TOOLS.length})')`,
          "page tools listed",
        )
        await act(() => audit.click(`Page tools (${EXPECTED_TOOLS.length})`, { role: "button" }))
        const names = await session.evaluate(
          `Array.from(document.querySelectorAll('[data-webmcp-tool]')).map(e => e.dataset.webmcpTool).sort()`,
        )
        if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) throw new Error(`Unexpected tools: ${names}`)
        if (!(await audit.find("How to add page tools", { optional: true })))
          throw new Error("Missing the builder guide link")
        await capture("w1-tools")
        if (actions > 8) throw new Error(`W1 took ${actions} actions; the budget is 8`)
        return { name: "project-browser", ok: true, detail: `W1 discovered ${names.length} page tools in ${actions} actions` }
      },
    ],
  })
} finally {
  server.close()
}
for (const line of outcome?.lines ?? []) console.log(line)
process.exitCode = outcome?.ok ? 0 : 1
