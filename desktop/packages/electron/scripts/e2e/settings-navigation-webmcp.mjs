#!/usr/bin/env node
// Verify stable Settings grouping through native navigation, filtering and responsive layouts.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const expected = [
  { id: "general", pages: ["Appearance", "Chat", "Sessions", "Notifications", "Shortcuts"] },
  { id: "projects", pages: ["Projects", "Git"] },
  { id: "models", pages: ["Providers", "Local Models"] },
  { id: "coding", pages: ["Agents", "Commands", "Skills", "MCP"] },
  { id: "advanced", pages: ["Behavior", "Hooks"] },
]
const inventoryExpression = `Array.from(document.querySelectorAll('[data-settings-navigation] [data-settings-group]')).map(group => ({
  id: group.getAttribute('data-settings-group'), pages: Array.from(group.querySelectorAll('button')).map(button => button.textContent.trim()) }))`
const outcome = await runHarness({
  ...args, uiWebMcp: true,
  journeys: [journeyBoot, async function journeySettingsNavigation({ session }) {
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const readings = []
    const verify = async (label, wanted = expected) => {
      await audit.wait(`JSON.stringify(${inventoryExpression}) === ${JSON.stringify(JSON.stringify(wanted))}`, label)
      readings.push({ label, groups: await session.evaluate(inventoryExpression) })
    }
    await session.send("Page.bringToFront")
    await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
    await audit.client.enable()
    await audit.click("Settings")
    await verify("fixed Settings group order")
    await audit.capture("Settings groups wide dark")
    for (const page of ["Hooks", "Appearance", "Providers", "Behavior", "Chat"]) {
      await audit.page(page)
      await verify(`order after ${page}`)
    }
    await audit.fill("Search settings", "Advanced")
    await verify("Advanced search keeps order", [expected.at(-1)])
    await audit.page("Hooks")
    await audit.fill("Search settings", "")
    await verify("cleared search restores full order")
    await audit.wait(`document.querySelector('[data-settings-group="advanced"] [aria-current="page"]')?.textContent.trim() === 'Hooks'`, "selected Hooks preserved after clear")
    await audit.fill("Search settings", "response style")
    await audit.find("Behavior", { role: "button" })
    await audit.page("Behavior")
    const prompt = (await audit.all()).controls.find(control => control.role === "textarea" && control.fillable && !control.disabled)
    if (!prompt) throw new Error("Behavior draft field unavailable")
    const originalPrompt = await session.evaluate(`document.querySelector('[data-settings-view] textarea')?.value`)
    await audit.fill(prompt.name, "Unsent navigation draft")
    await audit.fill("Search settings", "zzzznothingmatches")
    await verify("empty search has no phantom groups", [])
    await audit.wait(`document.querySelector('[data-settings-view]')?.textContent.includes('No settings match your search.')`, "empty search feedback")
    await audit.fill("Search settings", "")
    await verify("second search clear restores order")
    await audit.wait(`document.querySelector('[data-settings-group="advanced"] [aria-current="page"]')?.textContent.trim() === 'Behavior'`, "search never redirects selected page")
    await audit.wait(`document.querySelector('[data-settings-view] textarea')?.value === 'Unsent navigation draft'`, "filtering preserves unsaved draft")
    await audit.fill(prompt.name, originalPrompt)
    await audit.wait(`document.querySelector('[data-settings-view] textarea')?.value === ${JSON.stringify(originalPrompt)}`, "fixture draft restored without saving")
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "Settings closed")
    await audit.click("Settings")
    await verify("order after reopen")
    await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
    await audit.page("Hooks")
    await verify("narrow order")
    await audit.capture("Settings Advanced narrow dark")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await verify("light order")
    await audit.capture("Settings Preferences narrow light")
    await audit.page("Hooks")
    await audit.capture("Settings Advanced narrow light")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "navigation-receipt.json"), JSON.stringify({ readings, actions: audit.calls }, null, 2))
    return { name: "settings-navigation-webmcp", ok: true, detail: "Fixed five-group order through page changes, Advanced/style search, empty/clear, reopen and narrow light/dark layouts; Hooks and Behavior remain discoverable" }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
