#!/usr/bin/env node
// Preserve edits during creation using native controls and intercepted config HTTP only.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { waitForCondition } from "./cdp.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({ ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyMcpCreate({ session, e2e }) {
    const directory = e2e.scenario.project.worktree
    const inventory = []
    const requests = []
    const pending = []
    const errors = []
    const reply = async (requestId, body, responseCode = 200) => session.send("Fetch.fulfillRequest", {
      requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    })
    session.on("Fetch.requestPaused", event => {
      void (async () => {
        const url = new URL(event.request.url)
        const entry = { method: event.request.method, directory: url.searchParams.get("directory"), pathname: url.pathname, completed: false }
        requests.push(entry)
        if (entry.method === "GET") {
          await reply(event.requestId, entry.directory === directory ? inventory : [])
          entry.completed = true
        } else if (["POST", "PATCH"].includes(entry.method) && entry.directory === directory) {
          const body = JSON.parse(event.request.postData)
          if (body.enabled !== false || body.scope !== "project" || body.type !== "remote" || body.oauth !== false) throw new Error("Unsafe fixture payload")
          pending.push({ requestId: event.requestId, body, name: decodeURIComponent(url.pathname.split("/").at(-1)), entry })
        } else {
          await reply(event.requestId, { error: "Outside isolated fixture" }, 400)
          entry.completed = true
        }
      })().catch(error => errors.push(String(error)))
    })
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/config/mcp*", requestStage: "Request" }] })
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const field = "https://mcp.example.com/mcp"
    const urlRead = 'document.querySelector(\'input[placeholder="https://mcp.example.com/mcp"]\')?.value'
    const finish = async (index, reject = false) => {
      const mutation = pending[index]
      if (!mutation) throw new Error("Missing pending fixture mutation")
      if (!reject) {
        const existing = inventory.findIndex(server => server.name === mutation.name)
        const server = { name: mutation.name, ...mutation.body }
        if (existing < 0) inventory.push(server)
        else inventory[existing] = server
      }
      await reply(mutation.requestId, reject ? { error: "Fixture creation rejected" } : { ok: true, requiresReload: false, message: `Fixture saved ${index}` }, reject ? 400 : 200)
      mutation.entry.completed = true
      await audit.wait(`document.body.textContent.includes(${JSON.stringify(reject ? "Fixture creation rejected" : `Fixture saved ${index}`)})`, "acknowledged fixture outcome")
    }
    try {
      await audit.client.enable()
      await audit.click("Settings")
      await audit.page("MCP")
      await audit.click("Switch project")
      const option = (await audit.all()).controls.find(control => control.role === "menuitemradio" && control.name.includes(directory))
      if (!option) throw new Error("Missing isolated project")
      await audit.click(option.name, { role: "menuitemradio" })
      await waitForCondition(() => requests.some(request => request.directory === directory && request.completed), { timeoutMs: 5000, label: "scoped inventory" })
      for (const [caseIndex, name] of ["new-mcp-server", "renamed-server", "unchanged-server"].entries()) {
        await audit.click("Add MCP server")
        await audit.wait('Boolean(document.querySelector(\'input[placeholder="my-mcp-server"]\'))', "new MCP draft")
        await audit.fill("my-mcp-server", name)
        await audit.click("Global", { role: "combobox" })
        await audit.click("Project", { role: "option" })
        await audit.click("Enable server", { role: "checkbox" })
        await audit.click("Remote · SSE")
        const advanced = (await audit.all()).controls.find(control => control.name.startsWith("Configure advanced options"))
        await audit.click(advanced.name)
        await audit.click("Enable OAuth auto-detection", { role: "checkbox" })
        await audit.click((await audit.all()).controls.find(control => control.name.startsWith("Configure advanced options")).name)
        const submitted = `https://submitted-${caseIndex}.invalid`
        const newer = `https://new-unsaved-${caseIndex}.invalid`
        await audit.fill(field, submitted)
        const index = pending.length
        await audit.click("Create")
        await waitForCondition(() => pending.length > index || errors.length, { timeoutMs: 5000, label: "deferred create" })
        if (errors.length) throw new Error(errors.join("; "))
        if (!(await audit.find("my-mcp-server")).disabled || !(await audit.find("Project", { role: "combobox" })).disabled) throw new Error("Creation identity and scope must remain fixed while pending")
        if (caseIndex < 2) await audit.fill(field, newer)
        await audit.capture(`MCP creation ${caseIndex} pending`)
        await finish(index)
        await audit.wait('!document.querySelector(\'input[placeholder="my-mcp-server"]\')', "transition to existing server")
        await audit.capture(`MCP creation ${caseIndex} completed`)
        const expected = caseIndex < 2 ? newer : submitted
        const actual = await session.evaluate(urlRead)
        if (actual !== expected) throw new Error(`Creation ${caseIndex} lost current edits: expected ${expected}, received ${actual}`)
        const save = await audit.find("Save Changes")
        if (save.disabled !== (caseIndex === 2)) throw new Error("Created form has incorrect dirty state")
        const notice = await session.evaluate('Array.from(document.querySelectorAll(\'[data-settings-view] [role="status"]\')).some(element => element.textContent === "Unsaved changes")')
        if (notice !== (caseIndex < 2)) throw new Error("Unsaved changes notice disagrees with creation edits")
        if (caseIndex < 2) {
          await audit.fill(field, submitted)
          if (!(await audit.find("Save Changes")).disabled) throw new Error("Submitted creation snapshot is not the clean baseline")
          await audit.fill(field, newer)
          const updateIndex = pending.length
          await audit.click("Save Changes")
          await waitForCondition(() => pending.length > updateIndex, { timeoutMs: 5000, label: "follow-up update" })
          if (pending[updateIndex].name !== name || pending[updateIndex].body.url !== newer) throw new Error("Follow-up update targets wrong server or data")
          await finish(updateIndex)
          if (!(await audit.find("Save Changes")).disabled) throw new Error("Follow-up save remained dirty")
        }
      }
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.capture("MCP creation narrow dark")
      const captureNarrowUnsaved = async theme => {
        await audit.fill(field, `https://narrow-${theme}.invalid`)
        const noticeVisible = `(() => {
          const status = Array.from(document.querySelectorAll('[data-settings-view] [role="status"]')).find(element => element.textContent === 'Unsaved changes')
          const rect = status?.getBoundingClientRect()
          if (!rect || rect.width <= 0 || rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) return false
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return Boolean(hit && (hit === status || status.contains(hit)))
        })()`
        // Delivered wheel input is supplemental viewport setup, not a WebMCP action claim.
        for (let step = 0; step < 5 && !(await session.evaluate(noticeVisible)); step++) {
          await session.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 500, deltaX: 0, deltaY: 300 })
        }
        await audit.wait(noticeVisible, "unobscured unsaved notice inside narrow window")
        await audit.capture(`MCP creation narrow ${theme} unsaved`)
        const index = pending.length
        await audit.click("Save Changes")
        await waitForCondition(() => pending.length > index, { timeoutMs: 5000, label: "narrow deferred update" })
        await finish(index)
        if (!(await audit.find("Save Changes")).disabled) throw new Error("Narrow save did not become clean")
      }
      await captureNarrowUnsaved("dark")
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light theme")
      await audit.page("MCP")
      const target = (await audit.all()).controls.find(control => control.name.startsWith("renamed-serverhttps://"))
      await audit.click(target.name)
      await audit.wait(`${urlRead} === "https://new-unsaved-1.invalid"`, "saved fixture value after return")
      await audit.capture("MCP creation narrow light")
      await captureNarrowUnsaved("light")
      return { name: "mcp-create-webmcp", ok: true, detail: "Native creation preserves newer URL edits across refresh/handoff, default and renamed identities, follow-up update targeting and unchanged clean creation; narrow dark/light views checked; all config HTTP intercepted" }
    } finally {
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "fixture-requests.json"), JSON.stringify({ requests, errors, pending: pending.map(({ name, body, entry }) => ({ name, body, completed: entry.completed })), calls: audit.calls }, null, 2))
      }
      // Keep interception enabled; pending writes must never continue to the real configuration writer.
      for (const item of pending.filter(item => !item.entry.completed)) await reply(item.requestId, { error: "Fixture closed" }, 409).catch(() => {})
    }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
