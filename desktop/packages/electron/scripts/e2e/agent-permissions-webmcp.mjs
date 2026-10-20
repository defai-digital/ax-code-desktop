#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [journeyBoot, async function journeyAgentPermissions({ session }) {
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    await session.send("Page.bringToFront")
    await audit.client.enable()
    await audit.click("Settings")
    await audit.page("Agents")
    await audit.click("New Agent")
    await audit.click("Advanced Editor")
    await audit.click("Permission...", { role: "combobox" })
    await audit.click("Bash", { role: "option" })
    await audit.fill("Pattern (e.g. *)", "git status*")
    await audit.click("Ask", { role: "button" })
    await audit.wait('document.querySelector("[data-settings-view]")?.textContent.includes("git status*")', "new permission rule")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "permission-controls.json"), JSON.stringify(await audit.all(), null, 2))
    await audit.capture("Agent permission rule")
    await audit.click("Bash · git status*: Ask", { role: "combobox" })
    await audit.click("Deny", { role: "option" })
    await audit.wait(`Boolean(document.querySelector('[aria-label="Bash · git status*: Deny"]'))`, "pattern action changed")
    await audit.click("Reset: Bash · git status*")
    await audit.wait(`!document.querySelector('[aria-label="Bash · git status*: Deny"]')`, "pattern rule reset")
    if (!(await audit.find("Save Changes")).disabled) throw new Error("Resetting the added rule must restore clean state")
    await audit.click("Bash · *: Global", { role: "combobox" })
    await audit.click("Ask", { role: "option" })
    await audit.wait(`Boolean(document.querySelector('[aria-label="Bash · *: Ask"]'))`, "wildcard override changed")
    await audit.click("Reset: Bash · *")
    await audit.wait(`Boolean(document.querySelector('[aria-label="Bash · *: Global"]'))`, "wildcard reset")
    await audit.click("Global Default: Allow", { role: "combobox" })
    await audit.click("Ask", { role: "option" })
    await audit.wait(`Boolean(document.querySelector('[aria-label="Global Default: Ask"]'))`, "global draft changed")
    await audit.click("Global Default: Ask", { role: "combobox" })
    await audit.click("Allow", { role: "option" })
    await audit.wait(`Boolean(document.querySelector('[aria-label="Global Default: Allow"]'))`, "global draft restored")
    if (!(await audit.find("Save Changes")).disabled) throw new Error("Restoring permission overrides must restore clean state")
    await audit.click("Permission...", { role: "combobox" })
    await audit.click("Default", { role: "option" })
    await audit.fill("Pattern (e.g. *)", "src/private/**")
    await audit.click("Ask", { role: "button" })
    await audit.wait(`Boolean(document.querySelector('[aria-label="Default · src/private/**: Ask"]'))`, "wildcard permission pattern visible")
    await audit.click("Default · src/private/**: Ask", { role: "combobox" })
    await audit.click("Deny", { role: "option" })
    await audit.wait(`Boolean(document.querySelector('[aria-label="Default · src/private/**: Deny"]'))`, "wildcard permission pattern editable")
    await audit.capture("Wildcard permission pattern")
    await audit.click("Reset: Default · src/private/**")
    await audit.wait(`!document.querySelector('[aria-label="Default · src/private/**: Deny"]')`, "wildcard permission pattern reset")
    if (!(await audit.find("Save Changes")).disabled) throw new Error("Resetting the wildcard pattern must restore clean state")
    await audit.click("Hide Editor")
    await audit.wait(`!document.querySelector('input[placeholder="Pattern (e.g. *)"]')`, "advanced editor hidden")
    await audit.click("Advanced Editor")
    try {
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.click("Pattern (e.g. *)", { role: "input" })
      await audit.capture("Agent permissions narrow")
      await audit.wait(`(() => {
        const root = document.querySelector('[data-settings-view]')?.getBoundingClientRect()
        const fieldElement = document.querySelector('input[placeholder="Pattern (e.g. *)"]')
        const field = fieldElement?.getBoundingClientRect()
        const buttons = Array.from(fieldElement?.parentElement?.querySelectorAll('button') ?? []).filter(e => ['allow', 'ask', 'deny'].includes(e.textContent.trim().toLowerCase()))
        return root && field && field.width >= 100 && field.left >= root.left && field.right <= root.right && buttons.length === 3 && buttons.every(e => {
          const rect = e.getBoundingClientRect()
          return rect.width >= 30 && rect.left >= root.left && rect.right <= root.right
        })
      })()`, "custom rule controls remain editable in a narrow window")
      await audit.click("Deny", { role: "button" })
      await audit.wait('document.body.textContent.includes("Permission name is required")', "missing permission validation")
      if (!(await audit.find("Save Changes")).disabled) throw new Error("Invalid rule submission must leave the draft clean")
      await audit.wait(`!Array.from(document.querySelectorAll('[data-sonner-toast]')).some(e => e.textContent.includes('Permission name is required'))`, "validation toast dismissed")
      await audit.capture("Agent permission actions narrow")
    } finally {
      await session.send("Emulation.clearDeviceMetricsOverride")
    }
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "permission-calls.json"), `${JSON.stringify(audit.calls, null, 2)}\n`)
    return { name: "agent-permissions-webmcp", ok: true, detail: "Rule add/change/reset, wildcard and global draft restoration, hide/show, named controls and narrow bounds passed; no configuration save submitted" }
  }],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
