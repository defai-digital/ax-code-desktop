#!/usr/bin/env node
// Exercise nested configuration controls through native WebMCP in the isolated harness.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot, journeyPreloadBridge } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [journeyBoot, journeyPreloadBridge, async function journeyConfigEditors({ session }) {
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    // An inactive Electron window can change activeElement without delivering blur events.
    await session.send("Page.bringToFront")
    await audit.wait("document.hasFocus()", "native window focus for blur validation")
    await audit.client.enable()
    await audit.click("Settings")
    await audit.page("Commands")
    await audit.click("New Command")
    await audit.wait('Boolean(document.querySelector("textarea"))', "new command form")
    await audit.find("Global", { role: "combobox" })
    await audit.click("Global", { role: "combobox" })
    await audit.click("Project", { role: "option" })
    await audit.wait('document.querySelector("[data-settings-view] [data-slot=select-trigger]")?.textContent.trim() === "Project"', "project scope display")
    await audit.click("Project", { role: "combobox" })
    await audit.click("Global", { role: "option" })
    await audit.wait('document.querySelector("[data-settings-view] [data-slot=select-trigger]")?.textContent.trim() === "Global"', "global scope display")
    const controls = (await audit.all()).controls
    const agent = controls.filter((control) => control.name === "Override Agent: Not selected")
    const model = controls.filter((control) => control.name === "Override Model: Not selected")
    if (agent.length !== 1 || model.length !== 1) throw new Error("Execution selectors need distinct field names")
    await audit.click(agent[0].name)
    await audit.click("Not selected", { role: "menuitem" })
    await audit.wait('!document.querySelector("[role=menu]")', "agent menu closed")
    await audit.click(model[0].name)
    await audit.click("Not selected", { role: "button" })
    await audit.wait('!document.querySelector("[role=menu]")', "model picker closed")
    await audit.fill("What does this command do?", "Controlled draft validation")
    await audit.click("Save Changes")
    await audit.wait('document.body.textContent.includes("Command template is required")', "required template validation")
    const template = (await audit.all()).controls.find((control) => control.role === "textarea" && control.name.startsWith("Your command template"))
    if (!template) throw new Error("Command template field missing")
    await audit.fill(template.name, "Summarize $ARGUMENTS")
    await audit.wait('Array.from(document.querySelectorAll("textarea")).find(e => e.rows === 12)?.value === "Summarize $ARGUMENTS"', "template fill readback")
    await audit.fill(template.name, "")
    await audit.fill("What does this command do?", "")
    if (!(await audit.find("Save Changes")).disabled) throw new Error("Reverted draft must be clean")
    await audit.click("command-name", { role: "input" })
    await audit.capture("Command editor")
    try {
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.wait(`(() => {
        const root = document.querySelector('[data-settings-view]')?.getBoundingClientRect()
        const controls = ['input[placeholder="command-name"]', '[aria-label="Override Agent: Not selected"]', '[aria-label="Override Model: Not selected"]']
        return root && controls.every(selector => {
          const element = document.querySelector(selector)
          const rect = element?.getBoundingClientRect()
          return rect && rect.width >= 40 && rect.left >= root.left && rect.right <= root.right
        })
      })()`, "narrow editor controls remain inside Settings")
      await audit.capture("Command editor narrow")
    } finally {
      await session.send("Emulation.clearDeviceMetricsOverride")
    }
    await audit.page("Agents")
    await audit.click("New Agent")
    await audit.find("Global", { role: "combobox" })
    await audit.click("Global", { role: "combobox" })
    await audit.click("Project", { role: "option" })
    await audit.wait('document.querySelector("[data-settings-view] [data-slot=select-trigger]")?.textContent.trim() === "Project"', "agent project scope display")
    await audit.click("Project", { role: "combobox" })
    await audit.click("Global", { role: "option" })
    await audit.wait('document.querySelector("[data-settings-view] [data-slot=select-trigger]")?.textContent.trim() === "Global"', "agent global scope display")
    if (!(await audit.find("Save Changes")).disabled) throw new Error("Restoring agent scope must leave its draft clean")
    await audit.click("Increase value: Temperature")
    await audit.wait(`document.querySelector('[aria-label="Temperature"]')?.value === "0.8"`, "temperature increment")
    await audit.click("Decrease value: Top P")
    await audit.wait(`document.querySelector('[aria-label="Top P"]')?.value === "0.8"`, "top p decrement")
    await audit.fill("Temperature", "1.2")
    await audit.click("Top P", { role: "input" })
    await audit.wait(`document.querySelector('[aria-label="Temperature"]')?.value === "1.2"`, "temperature fill commit")
    await audit.fill("Top P", "2")
    await audit.click("Temperature", { role: "input" })
    await audit.wait(`document.querySelector('[aria-label="Top P"]')?.value === "1"`, "top p maximum clamp")
    if (!(await audit.find("Increase value: Top P")).disabled) throw new Error("Top P increment must be disabled at its maximum")
    await audit.click("Clear temperature override")
    await audit.click("Clear top p override")
    if (!(await audit.find("Save Changes")).disabled) throw new Error("Cleared parameter overrides must restore clean state")
    await audit.capture("Agent editor scope")
    try {
      await session.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
      await audit.capture("Agent editor narrow")
      await audit.wait(`(() => {
        const root = document.querySelector('[data-settings-view]')?.getBoundingClientRect()
        const controls = document.querySelectorAll('[data-settings-view] input[placeholder="agent-name"], [data-settings-view] input[placeholder="—"], [data-settings-view] [aria-label="Override Model: Not selected"], [data-settings-view] [aria-label^="Increase value:"], [data-settings-view] [aria-label^="Decrease value:"]')
        return root && controls.length === 8 && Array.from(controls).every(element => {
          const rect = element.getBoundingClientRect()
          return rect.width >= 16 && rect.left >= root.left && rect.right <= root.right
        })
      })()`, "narrow agent fields remain inside Settings")
      await audit.click("Top P", { role: "input" })
      await audit.capture("Agent parameters narrow")
    } finally {
      await session.send("Emulation.clearDeviceMetricsOverride")
    }
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "config-editor-calls.json"), `${JSON.stringify(audit.calls, null, 2)}\n`)
    return { name: "config-editors-webmcp", ok: true, detail: "Agent numeric edit/step/clamp/clear and narrow bounds, command and agent scope labels, distinct command selectors, picker actions, required-template validation, field readback, clean-state restoration and narrow layout passed; no valid save submitted" }
  }],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
