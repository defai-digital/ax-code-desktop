#!/usr/bin/env node
// Delayed inventories and deletion targeting through native UI handlers; all config HTTP intercepted.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { waitForCondition } from "./cdp.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const startUnselected = process.argv.includes("--unselected")
const revealReplacement = process.argv.includes("--replacement")
const outcome = await runHarness({ ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyMcpDelete({ session, e2e }) {
    const projects = [e2e.scenario.project, e2e.scenario.portfolio[0].project]
    const inventories = new Map(projects.map((project, index) => [project.worktree, [
      { name: "review", scope: "project", type: "remote", url: `https://project-${index}.invalid`, enabled: false, oauth: false },
      { name: `extra-${index}`, scope: "project", type: "remote", url: `https://extra-${index}.invalid`, enabled: false, oauth: false },
    ]]))
    let holdBeta = true
    let permitDelete = false
    const held = []
    const requests = []
    const errors = []
    const reply = (requestId, body, responseCode = 200) => session.send("Fetch.fulfillRequest", {
      requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    })
    session.on("Fetch.requestPaused", event => {
      void (async () => {
        const url = new URL(event.request.url)
        const entry = { method: event.request.method, directory: url.searchParams.get("directory"), pathname: url.pathname, completed: false }
        requests.push(entry)
        if (entry.method === "GET") {
          if (entry.directory === projects[1].worktree && holdBeta) held.push({ requestId: event.requestId, entry })
          else { await reply(event.requestId, inventories.get(entry.directory) ?? []); entry.completed = true }
        } else if (entry.method === "DELETE" && entry.directory === projects[1].worktree && url.pathname.endsWith("/review")) {
          if (permitDelete) {
            inventories.set(entry.directory, inventories.get(entry.directory).filter(server => server.name !== "review"))
            if (revealReplacement) inventories.get(entry.directory).push({ name: "review", scope: "user", type: "remote", url: "https://replacement.invalid", enabled: false, oauth: false })
            await reply(event.requestId, { ok: true, requiresReload: false, message: "Fixture deleted Beta review" })
          } else await reply(event.requestId, { error: "Fixture rejected stale inventory deletion" }, 409)
          entry.completed = true
        } else { await reply(event.requestId, { error: "Outside isolated fixture" }, 400); entry.completed = true }
      })().catch(error => errors.push(String(error)))
    })
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/config/mcp*", requestStage: "Request" }] })
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const selectProject = async index => {
      await audit.click("Switch project")
      const target = (await audit.all()).controls.find(control => control.role === "menuitemradio" && control.name.includes(projects[index].worktree))
      await audit.click(target.name, { role: "menuitemradio" })
    }
    const openDelete = async () => {
      await audit.click("More actions for review")
      await audit.click("Delete", { role: "menuitem" })
      await audit.wait('Boolean(document.querySelector(\'[role="dialog"] button\'))', "delete confirmation")
      await audit.click("Delete", { role: "button" })
    }
    try {
      await audit.client.enable()
      await audit.click("Settings")
      await audit.page("MCP")
      await selectProject(0)
      await audit.wait('document.querySelector("[data-settings-view]")?.textContent.includes("https://project-0.invalid")', "Alpha inventory")
      if (!startUnselected) {
        const alpha = (await audit.all()).controls.find(control => control.name.startsWith("reviewhttps://project-0.invalid"))
        await audit.click(alpha.name)
      } else {
        await audit.wait('document.querySelector("[data-settings-view]")?.textContent.includes("or add a new one")', "initial unselected state")
      }
      await selectProject(1)
      await waitForCondition(() => held.length > 0, { timeoutMs: 5000, label: "held Beta inventory" })
      await audit.capture("MCP Beta awaiting inventory")
      const stale = await audit.find("More actions for review", { optional: true })
      if (stale && !stale.disabled) {
        await openDelete()
        await waitForCondition(() => requests.some(request => request.method === "DELETE" && request.completed), { timeoutMs: 5000, label: "record wrong-target deletion" })
        await audit.capture("MCP stale inventory deletion rejected")
        throw new Error("Alpha's stale sidebar action sent DELETE to Beta before Beta inventory arrived")
      }
      if (!(await audit.find("Add MCP server")).disabled) throw new Error("Creation still uses a mismatched inventory")
      if (await session.evaluate('document.querySelector("[data-settings-view]")?.textContent.includes("or add a new one")')) throw new Error("Detail view advertises disabled creation during inventory loading")
      // Browser tools belong to this app and remain available while project inventory is unresolved.
      const browser = (await audit.all()).controls.find(control => control.name.startsWith("Project browser (WebMCP)"))
      if (!browser) throw new Error("Browser tools disappeared with project inventory")
      holdBeta = false
      for (const read of held) {
        await reply(read.requestId, { error: "Fixture Beta load unavailable" }, 503)
        read.entry.completed = true
      }
      await audit.wait('Boolean(document.querySelector("[data-settings-view] [role=alert]"))', "failed scoped inventory")
      await audit.capture("MCP Beta inventory failure")
      await audit.click("Retry")
      await audit.wait('document.querySelector("[data-settings-view]")?.textContent.includes("https://project-1.invalid")', "Beta retry inventory")
      if (await session.evaluate('document.querySelector("[data-settings-view]")?.textContent.includes("https://project-0.invalid")')) throw new Error("Alpha inventory survived Beta retry")
      const target = (await audit.all()).controls.find(control => control.name.startsWith("reviewhttps://project-1.invalid"))
      await audit.click(target.name)
      permitDelete = true
      await openDelete()
      await audit.wait('document.body.textContent.includes("Fixture deleted Beta review")', "valid deletion acknowledged")
      if (revealReplacement) {
        await audit.wait('document.querySelector(\'input[placeholder="https://mcp.example.com/mcp"]\')?.value === "https://replacement.invalid"', "same-name replacement loaded into detail form")
        if (!(await audit.find("Save Changes")).disabled) throw new Error("Replacement form did not start clean")
      } else if (await audit.find("More actions for review", { optional: true })) throw new Error("Deleted Beta server remains actionable")
      const writes = requests.filter(request => request.method === "DELETE")
      if (writes.length !== 1 || writes[0].directory !== projects[1].worktree || !writes[0].completed) throw new Error("Deletion targeting was not exact")
      if (!inventories.get(projects[0].worktree).some(server => server.name === "review")) throw new Error("Valid Beta deletion affected Alpha")
      await audit.capture("MCP Beta deletion complete")
      const extra = (await audit.all()).controls.find(control => control.name.startsWith("extra-1https://"))
      await audit.click(extra.name)
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.capture("MCP deletion narrow dark")
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light theme")
      await audit.page("MCP")
      await audit.capture("MCP deletion narrow light")
      if (errors.length) throw new Error(errors.join("; "))
      return { name: "mcp-delete-webmcp", ok: true, detail: "Stale project inventory withholds server actions/create, browser tools remain, failed load retries, exact Beta deletion preserves Alpha, populated narrow light/dark views pass; config HTTP intercepted, no real writer/MCP/OAuth" }
    } finally {
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "fixture-requests.json"), JSON.stringify({ startUnselected, revealReplacement, requests, errors, calls: audit.calls }, null, 2))
      }
      // Keep interception until shutdown; held reads are failed rather than sent to the real backend.
      for (const read of held.filter(item => !item.entry.completed)) await reply(read.requestId, [], 503).catch(() => {})
    }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
