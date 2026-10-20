#!/usr/bin/env node
// Observe configuration feedback through native WebMCP against delayed HTTP fixtures.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { waitForCondition } from "./cdp.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({ ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyConfigurationUpdate({ session, e2e }) {
    const directory = e2e.scenario.project.worktree
    let server = { name: "review", scope: "project", type: "remote", url: "https://initial.invalid", enabled: false, oauth: false }
    const pending = []
    const requests = []
    const observations = []
    const errors = []
    const reply = (requestId, body, responseCode = 200) => session.send("Fetch.fulfillRequest", {
      requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    })
    session.on("Fetch.requestPaused", event => {
      void (async () => {
        const url = new URL(event.request.url)
        const entry = { method: event.request.method, directory: url.searchParams.get("directory"), completed: false }
        requests.push(entry)
        if (entry.method === "GET") {
          await reply(event.requestId, entry.directory === directory ? [server] : [])
          entry.completed = true
        } else if (entry.method === "PATCH" && entry.directory === directory && url.pathname.endsWith("/review")) {
          const body = JSON.parse(event.request.postData)
          if (body.enabled !== false || body.scope !== "project" || body.type !== "remote" || body.oauth !== false) throw new Error("Unsafe fixture payload")
          pending.push({ requestId: event.requestId, body, entry })
        } else {
          await reply(event.requestId, { error: "Outside isolated configuration fixture" }, 400)
          entry.completed = true
        }
      })().catch(error => errors.push(String(error)))
    })
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/config/mcp*", requestStage: "Request" }] })
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const field = "https://mcp.example.com/mcp"
    const observe = async (label, expected) => {
      const state = await audit.all()
      const dom = await session.evaluate(`(() => {
        const overlay = document.querySelector('[role="status"][aria-busy="true"]')
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
        return { visible: Boolean(overlay), marked: Boolean(document.querySelector('[data-config-update-overlay]')),
          title: overlay?.textContent || '', coversCenter: Boolean(overlay && hit && overlay.contains(hit)) }
      })()`)
      observations.push({ label, configurationOverlayVisible: state.configurationOverlayVisible ?? null, dom })
      if (expected && (!dom.title.includes("Updating configuration") || dom.title.includes("AX Code is restarting"))) throw new Error("Ordinary pending configuration falsely reports a runtime restart")
      if (state.configurationOverlayVisible !== expected || dom.visible !== expected || dom.marked !== expected || dom.coversCenter !== expected) throw new Error(`${label}: native overlay observation disagrees with independent DOM/hit test`)
    }
    const submit = async value => {
      await audit.fill(field, value)
      const index = pending.length
      await audit.click("Save Changes")
      await waitForCondition(() => pending.length > index || errors.length, { timeoutMs: 5000, label: "deferred configuration write" })
      if (errors.length) throw new Error(errors.join("; "))
      await audit.capture(`Configuration pending ${index}`)
      await observe(`pending ${index}`, true)
      return index
    }
    const finish = async (index, reject = false) => {
      const mutation = pending[index]
      if (!reject) server = { ...server, ...mutation.body }
      await reply(mutation.requestId, reject ? { error: "Fixture rejected configuration" } : { ok: true, requiresReload: false, message: `Fixture saved ${index}` }, reject ? 400 : 200)
      mutation.entry.completed = true
      await audit.wait(`document.body.textContent.includes(${JSON.stringify(reject ? "Fixture rejected configuration" : `Fixture saved ${index}`)})`, "fixture outcome visible")
      await observe(`completed ${index}`, false)
    }
    const openServer = async () => {
      const target = (await audit.all()).controls.find(control => control.role === "button" && control.name.startsWith("reviewhttps://"))
      if (!target) throw new Error("Missing fixture server")
      await audit.click(target.name)
    }
    try {
      await audit.client.enable()
      await audit.click("Settings")
      await audit.page("MCP")
      await audit.click("Switch project")
      const option = (await audit.all()).controls.find(control => control.role === "menuitemradio" && control.name.includes(directory))
      await audit.click(option.name, { role: "menuitemradio" })
      await audit.wait('Array.from(document.querySelectorAll("[data-settings-view] button")).some(button => button.textContent.includes("review"))', "fixture inventory")
      await openServer()
      await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
      const first = await submit("https://accepted.invalid")
      await audit.capture("Configuration pending wide dark")
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.capture("Configuration pending narrow dark")
      await finish(first)
      if (!(await audit.find("Save Changes")).disabled) throw new Error("Acknowledged unchanged save remained dirty")
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light theme")
      await audit.page("MCP")
      await openServer()
      const rejected = await submit("https://retry.invalid")
      await audit.capture("Configuration pending narrow light")
      await finish(rejected, true)
      if ((await audit.find("Save Changes")).disabled) throw new Error("Rejected write did not permit retry")
      await audit.capture("Configuration rejection recovered")
      const retry = await submit("https://retry.invalid")
      const input = await audit.find(field)
      const action = await audit.client.call("ax_desktop_fill", { ref: input.ref, value: "https://newer-unsaved.invalid" })
      if (action.ui?.configurationOverlayVisible !== true) throw new Error("Action response omitted active overlay observation")
      await observe("semantic edit behind overlay", true)
      await finish(retry)
      await audit.wait('document.querySelector(\'input[placeholder="https://mcp.example.com/mcp"]\')?.value === "https://newer-unsaved.invalid"', "newer semantic edit survives acknowledgement")
      await audit.capture("Configuration newer edits remain unsaved")
      return { name: "config-update-webmcp", ok: true, detail: "Neutral pending feedback, native overlay flag versus DOM/hit testing, accepted/rejected/retried writes, action snapshot flag and wide/narrow light/dark captures passed; config HTTP intercepted; semantic handlers do not qualify physical pointer access through overlay" }
    } finally {
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "observations.json"), JSON.stringify({ observations, requests, errors, calls: audit.calls }, null, 2))
      }
      // Keep interception enabled until shutdown; unfinished writes never continue to the real writer.
      for (const mutation of pending.filter(item => !item.entry.completed)) await reply(mutation.requestId, { error: "Fixture closed" }, 409).catch(() => {})
    }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
