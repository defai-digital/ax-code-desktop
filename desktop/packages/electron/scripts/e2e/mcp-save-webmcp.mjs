#!/usr/bin/env node
// Native controls against intercepted configuration HTTP responses. No disk writes or MCP processes.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { waitForCondition } from "./cdp.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyMcpSave({ session, e2e }) {
    const projects = [e2e.scenario.project, e2e.scenario.portfolio[0].project]
    const inventory = new Map(projects.map((project, index) => [project.worktree, [
      { name: "review", scope: "project", type: "remote", url: `https://project-${index}.invalid`, enabled: false, oauth: false },
    ]]))
    const requests = []
    const pending = []
    const errors = []
    const fulfill = (requestId, body, responseCode = 200) => session.send("Fetch.fulfillRequest", {
      requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    })
    // Intercept every method before opening MCP. Mutations never reach the configuration writer.
    session.on("Fetch.requestPaused", event => {
      void (async () => {
        const url = new URL(event.request.url)
        const directory = url.searchParams.get("directory")
        const entry = { method: event.request.method, directory, pathname: url.pathname, completed: false }
        requests.push(entry)
        if (event.request.method === "GET") {
          await fulfill(event.requestId, inventory.get(directory) ?? [])
          entry.completed = true
        } else if (event.request.method === "PATCH" && inventory.has(directory)) {
          const body = JSON.parse(event.request.postData)
          if (body.enabled !== false || body.scope !== "project" || body.type !== "remote") throw new Error("Unsafe fixture mutation")
          pending.push({ requestId: event.requestId, directory, body, entry })
        } else {
          await fulfill(event.requestId, { error: "Mutation is outside the isolated fixture" }, 400)
          entry.completed = true
        }
      })().catch(error => errors.push(String(error)))
    })
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/config/mcp*", requestStage: "Request" }] })
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const field = "https://mcp.example.com/mcp"
    const readUrl = 'document.querySelector(\'input[placeholder="https://mcp.example.com/mcp"]\')?.value'
    const selectProject = async (index, waitForForm = true) => {
      await audit.click("Switch project")
      const options = (await audit.all()).controls.filter(control => control.role === "menuitemradio")
      const target = options.find(control => control.name.includes(projects[index].worktree))
      if (!target) throw new Error("Missing isolated project target")
      await audit.click(target.name, { role: "menuitemradio" })
      if (waitForForm) await audit.wait(`${readUrl} === ${JSON.stringify(inventory.get(projects[index].worktree)[0].url)}`, "selected project URL")
    }
    const finish = async index => {
      const mutation = pending[index]
      if (!mutation) throw new Error("Missing deferred mutation")
      inventory.set(mutation.directory, [{ ...inventory.get(mutation.directory)[0], ...mutation.body }])
      await fulfill(mutation.requestId, { ok: true, requiresReload: false, message: `Fixture saved ${index}` })
      mutation.entry.completed = true
      await audit.wait(`document.body.textContent.includes(${JSON.stringify(`Fixture saved ${index}`)})`, "mutation outcome visible")
    }
    try {
      await audit.client.enable()
      await audit.click("Settings")
      await audit.page("MCP")
      await selectProject(0, false)
      await audit.wait('Array.from(document.querySelectorAll("[data-settings-view] button")).some(button => button.textContent.includes("review"))', "fixture server listed")
      const openServer = async () => {
        const target = (await audit.all()).controls.find(control => control.role === "button" && control.name.startsWith("review"))
        if (!target) throw new Error("Missing fixture server target")
        await audit.click(target.name)
      }
      await openServer()
      await audit.wait(`Boolean(${readUrl})`, "fixture MCP form")
      await selectProject(0)
      await audit.fill(field, "https://alpha-saved.invalid")
      await audit.click("Save Changes")
      await waitForCondition(() => pending.length === 1 || errors.length, { timeoutMs: 5000, label: "deferred Alpha save" })
      if (errors.length) throw new Error(errors.join("; "))
      await selectProject(1)
      await audit.capture("MCP Beta while Alpha saves")
      await finish(0)
      await audit.fill(field, "https://temporary.invalid")
      await audit.fill(field, "https://project-1.invalid")
      const reverted = await audit.find("Save Changes")
      await audit.capture("MCP Beta reverted after Alpha save")
      if (!reverted.disabled) throw new Error("Late Alpha save replaced Beta's clean baseline")
      await audit.fill(field, "https://beta-saved.invalid")
      await audit.click("Save Changes")
      await waitForCondition(() => pending.length === 2, { timeoutMs: 5000, label: "deferred Beta save" })
      await finish(1)
      if (!(await audit.find("Save Changes")).disabled) throw new Error("Successful unchanged MCP form remained dirty")
      await audit.capture("MCP Beta saved clean")
      for (const index of [0, 1]) {
        await selectProject(index)
        await audit.capture(`MCP persisted fixture ${index}`)
      }
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.capture("MCP narrow dark")
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.page("MCP")
      await openServer()
      await audit.capture("MCP narrow light")
      if (errors.length) throw new Error(errors.join("; "))
      if (requests.some(request => request.method !== "GET" && !projects.some(project => project.worktree === request.directory))) throw new Error("Mutation escaped fixture scope")
      return { name: "mcp-save-webmcp", ok: true, detail: "Native deferred cross-project saves, clean baseline, captured scoped requests and populated narrow light/dark views passed; all configuration HTTP requests intercepted; no real configuration write, MCP execution or OAuth" }
    } finally {
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "fixture-requests.json"), JSON.stringify({ requests, errors, pending: pending.map(({ directory, body, entry }) => ({ directory, body, completed: entry.completed })), calls: audit.calls }, null, 2))
      }
      // Do not disable interception while requests are pending: that would send writes to the real route.
      for (const mutation of pending.filter(item => !item.entry.completed)) {
        await fulfill(mutation.requestId, { error: "Fixture closed" }, 409).catch(() => {})
      }
    }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
