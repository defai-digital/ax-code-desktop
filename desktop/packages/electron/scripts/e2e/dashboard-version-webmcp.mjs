#!/usr/bin/env node
// Exercise a restored Dashboard tab with controlled version responses.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [
    journeyBoot,
    async function dashboardVersions({ session, e2e }) {
      const directory = e2e.scenario.session.directory
      const errors = []
      let fixtureVersion = "7.24.1junk"
      const reports = new Set()
      session.on("Fetch.requestPaused", (event) => {
        void (async () => {
          const url = new URL(event.request.url)
          if (event.request.method !== "GET") throw new Error("Unexpected dashboard request method")
          const isVersion = url.pathname === "/api/ax-code/upgrade-status"
          const root = url.pathname.split("/")[1]
          if (!isVersion) {
            if (!["dre-graph", "run-report"].includes(root) || url.searchParams.get("directory") !== directory) {
              throw new Error("Dashboard report escaped the fixture directory")
            }
            reports.add(root)
          }
          const body = isVersion
            ? JSON.stringify({ currentVersion: fixtureVersion, available: null, latestVersion: null })
            : `<!doctype html><title>Fixture report</title><p>Fixture report: ${root}</p>`
          await session.send("Fetch.fulfillRequest", {
            requestId: event.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: isVersion ? "application/json" : "text/html; charset=utf-8" }],
            body: Buffer.from(body).toString("base64"),
          })
        })().catch((error) => errors.push(String(error)))
      })
      await session.send("Fetch.enable", { patterns: [
        { urlPattern: "*/api/ax-code/upgrade-status", requestStage: "Request" },
        { urlPattern: "*/dre-graph*", requestStage: "Request" },
        { urlPattern: "*/run-report*", requestStage: "Request" },
      ] })

      await session.evaluate(`(() => {
        const saved = JSON.parse(localStorage.getItem('ui-store') || '{}')
        const tab = { id:'dashboard', mode:'dashboard', dedupeKey:'dashboard', label:'Dashboard', touchedAt:1 }
        localStorage.setItem('ui-store', JSON.stringify({version:15,state:{...saved.state,
          activeMainTab:'chat', isSidebarOpen:true, splitPaneEnabled:false,
          contextPanelByDirectory:{[${JSON.stringify(directory)}]:{
            tabs:[tab],activeTabId:tab.id,isOpen:true,expanded:false,width:640,touchedAt:1
          }}
        }}))
      })()`)

      const audit = new SettingsWebMcpAudit(session)
      for (const fixture of [
        { version: "7.24.1junk", root: "dre-graph", name: "malformed" },
        { version: "v7.24.1+local.1", root: "run-report", name: "current" },
      ]) {
        fixtureVersion = fixture.version
        if (fixture.name === "malformed") {
          await session.send("Page.reload", { ignoreCache: true })
          await journeyBoot({ session })
          await audit.client.enable()
        } else {
          await audit.click("Refresh", { role: "button" })
        }
        const frame = `document.querySelector('[data-context-panel] iframe[title$="Dashboard"]')`
        await audit.wait(`(() => {
          const frame = ${frame}
          if (!frame?.checkVisibility()) return false
          const url = new URL(frame.src)
          return url.pathname.split('/')[1] === ${JSON.stringify(fixture.root)}
            && url.searchParams.get('directory') === ${JSON.stringify(directory)}
        })()`, `visible ${fixture.root} iframe and directory`)
        await audit.wait(`Array.from(document.querySelectorAll('[data-context-panel] button')).some(b => b.textContent.trim() === 'Open' && !b.disabled)`, "Dashboard Open enabled")
        if (args.artifacts) {
          const state = await audit.all()
          const src = await session.evaluate(`${frame}.src`)
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.mkdir(args.artifacts, { recursive: true })
          await fs.writeFile(path.join(args.artifacts, `${fixture.name}.json`), JSON.stringify({ ...fixture, src, state }, null, 2))
          await fs.writeFile(path.join(args.artifacts, `${fixture.name}.png`), Buffer.from(data, "base64"))
        }
      }
      if (errors.length) throw new Error(errors.join("\n"))
      if (!reports.has("dre-graph") || !reports.has("run-report")) throw new Error("Missing both fixture report requests")
      return { name: "dashboard-versions", ok: true, detail: "Restored Dashboard falls back for a malformed version and switches to the current route on Refresh" }
    },
  ],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
