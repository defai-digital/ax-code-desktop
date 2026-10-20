#!/usr/bin/env node
// All Settings navigation and control inventory, using native WebMCP for UI actions.
import fs from "node:fs/promises"
import path from "node:path"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot, journeyPreloadBridge } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { UiWebMcpClient } from "./ui-webmcp-client.mjs"

export const SETTINGS_PAGES = [
  "Local Models",
  "Appearance",
  "Chat",
  "Notifications",
  "Sessions",
  "Shortcuts",
  "Git",
  "Projects",
  "Agents",
  "Behavior",
  "Commands",
  "MCP",
  "Hooks",
  "Providers",
  "Skills",
]

export class SettingsWebMcpAudit {
  constructor(session, artifacts = "") {
    this.session = session
    this.artifacts = artifacts
    this.client = new UiWebMcpClient(session)
    this.calls = []
  }
  async read(offset = 0) {
    return this.client.call("ax_desktop_get_ui_state", { offset })
  }
  async all() {
    let page = await this.read()
    const controls = [...page.controls]
    while (page.nextOffset !== null) {
      page = await this.read(page.nextOffset)
      controls.push(...page.controls)
    }
    return { ...page, controls }
  }
  async find(name, { role, optional = false, index = 0 } = {}) {
    let page = await this.read()
    while (true) {
      const matches = page.controls.filter((control) => control.name === name && (!role || control.role === role))
      if (matches[index]) return matches[index]
      if (page.nextOffset === null) break
      page = await this.read(page.nextOffset)
    }
    if (optional) return null
    throw new Error(`Missing UI control: ${name}`)
  }
  async click(name, options) {
    const control = await this.find(name, options)
    if (!control) return false
    await this.client.call("ax_desktop_click", { ref: control.ref })
    this.calls.push({ action: "click", name })
    return true
  }
  async fill(name, value) {
    const control = await this.find(name)
    await this.client.call("ax_desktop_fill", { ref: control.ref, value })
    this.calls.push({ action: "fill", name, value })
  }
  async wait(expression, label) {
    return waitForCondition(() => this.session.evaluate(expression), { timeoutMs: 10_000, label })
  }
  async page(name) {
    await this.click(name, { role: "button" })
    await this.wait(
      `Array.from(document.querySelectorAll('[data-settings-view] button[aria-current="page"]')).some(e => e.textContent.trim() === ${JSON.stringify(name)})`,
      `${name} navigation`,
    )
    // A loaded page may replace its spinner after the navigation state commits.
    await this.wait(`!document.querySelector('[data-settings-view] [aria-busy="true"]')`, `${name} loading`)
  }
  async capture(name) {
    const state = await this.all()
    const inspection = await this.session.evaluate(`(() => {
      const root = document.querySelector('[data-settings-view]')
      return { text: root?.innerText || '', overflow: root ? root.scrollWidth > root.clientWidth + 1 : false,
        alerts: Array.from(root?.querySelectorAll('[role="alert"]') || []).map(e=>e.textContent) }
    })()`)
    if (inspection.text.includes("Something went wrong")) throw new Error(`${name}: Settings hit its error boundary`)
    const unnamed = state.controls.filter((control) => !control.name)
    if (unnamed.length)
      throw new Error(`${name}: ${unnamed.length} unnamed controls (${unnamed.map((c) => c.role).join(", ")})`)
    if (inspection.overflow) throw new Error(`${name}: Settings root overflows horizontally`)
    const result = { page: name, count: state.controls.length, state, inspection }
    if (this.artifacts) {
      await fs.mkdir(this.artifacts, { recursive: true })
      const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      await fs.writeFile(path.join(this.artifacts, `${stem}.json`), `${JSON.stringify(result, null, 2)}\n`)
      const { data } = await this.session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(this.artifacts, `${stem}.png`), Buffer.from(data, "base64"))
    }
    return result
  }
}

export const createSettingsJourney = (artifacts = "") =>
  async function journeySettingsWebMcp({ session }) {
    const audit = new SettingsWebMcpAudit(session, artifacts ? path.join(artifacts, "pages") : "")
    await audit.client.enable()
    await audit.click("Settings")
    await audit.wait('Boolean(document.querySelector("[data-settings-view]"))', "Settings view")
    const pages = []
    for (const page of SETTINGS_PAGES) {
      await audit.page(page)
      pages.push(await audit.capture(page))
    }
    await audit.page("Appearance")
    await audit.click("Conversation language")
    await audit.find("English", { role: "option" })
    await audit.click("English", { role: "option" })
    await audit.wait('document.querySelector(\'[aria-labelledby="language-conversation-label"]\')?.getAttribute("aria-expanded") === "false" && document.querySelector(\'[aria-labelledby="language-conversation-label"]\')?.textContent.includes("English")', "conversation language changed and closed")
    await audit.fill("Terminal Font Size", "15")
    await audit.click("Increase value: Terminal Font Size")
    await audit.wait(
      'document.querySelector(\'input[aria-label="Terminal Font Size"]\')?.value === "16"',
      "terminal font stepper",
    )
    await audit.click("Reset terminal font size")
    await audit.wait(
      'document.querySelector(\'input[aria-label="Terminal Font Size"]\')?.value === "13"',
      "terminal font reset",
    )
    // Exercise reversible local preferences; native-dialog, permission and external-service actions are excluded.
    for (const page of ["Appearance", "Chat"]) {
      await audit.page(page)
      const toggles = (await audit.all()).controls.filter((control) => control.role === "checkbox" && !control.disabled)
      for (const toggle of toggles) {
        const expression = `JSON.stringify(Array.from(document.querySelectorAll('[data-settings-view] input[type="checkbox"], [data-settings-view] [role="checkbox"]')).map(e => e.matches('input') ? e.checked : e.getAttribute('aria-checked')))`
        const before = await session.evaluate(expression)
        await audit.click(toggle.name, { role: "checkbox" })
        await audit.wait(`${expression} !== ${JSON.stringify(before)}`, `${toggle.name} changed`)
        await audit.click(toggle.name, { role: "checkbox" })
        await audit.wait(`${expression} === ${JSON.stringify(before)}`, `${toggle.name} restored`)
      }
    }
    await audit.page("Shortcuts")
    const shortcuts = await audit.all()
    if (shortcuts.controls.length <= 100) throw new Error("Shortcuts did not exercise paginated control discovery")
    await audit.click("Open command palette (alternate)", { role: "input" })
    await audit.wait(
      'document.activeElement?.getAttribute("aria-label") === "Open command palette (alternate)"',
      "read-only shortcut capture focus",
    )
    await audit.fill("Search Keyboard Shortcuts", "terminal")
    await audit.wait(
      `document.querySelectorAll('[data-settings-view] input[readonly]').length === 2`,
      "shortcut search filtering",
    )
    await audit.fill("Search Keyboard Shortcuts", "zzzznomatch")
    await audit.wait(
      `document.querySelectorAll('[data-settings-view] input[readonly]').length === 0`,
      "shortcut empty search",
    )
    await audit.click("Clear search")
    await audit.wait(
      `document.querySelectorAll('[data-settings-view] input[readonly]').length === 33`,
      "shortcut search restored",
    )
    await audit.capture("Shortcuts after search")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.page("Shortcuts")
    await audit.capture("Shortcuts light")
    try {
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: 800, height: 700, deviceScaleFactor: 1, mobile: false,
      })
      await audit.wait(
        `Array.from(document.querySelectorAll('[data-settings-view] input[readonly]')).every(e => e.clientWidth >= 150)`,
        "shortcut fields retain readable width in a narrow window",
      )
      await audit.capture("Shortcuts narrow light")
    } finally {
      await session.send("Emulation.clearDeviceMetricsOverride")
    }
    await audit.page("Appearance")
    await audit.click("Dark")
    await audit.wait('document.documentElement.classList.contains("dark")', "dark theme")
    await audit.page("Shortcuts")
    await audit.capture("Shortcuts dark")
    await audit.page("Appearance")
    await audit.click("System")
    await audit.page("Hooks")
    await audit.wait(
      `document.querySelector('[data-settings-view] [role="alert"]')?.textContent.includes('Invalid hooks response')`,
      "malformed Hooks response is retryable",
    )
    await audit.click("Retry")
    await audit.wait(
      `document.querySelector('[data-settings-view] [role="alert"]')?.textContent.includes('Invalid hooks response')`,
      "Hooks retry stays in the load error",
    )
    if (artifacts)
      await fs.writeFile(path.join(artifacts, "settings-calls.json"), `${JSON.stringify(audit.calls, null, 2)}\n`)
    return {
      name: "settings-webmcp",
      ok: true,
      detail: `${pages.length} Settings tabs, ${pages.reduce((sum, p) => sum + p.count, 0)} rendered control observations; native option, numeric, preference toggle/restore, shortcut paging/search/focus, light/dark/narrow layout and malformed-response checks passed`,
    }
  }

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2))
  const outcome = await runHarness({
    ...args,
    uiWebMcp: true,
    journeys: [journeyBoot, journeyPreloadBridge, createSettingsJourney(args.artifacts)],
  })
  outcome.lines.forEach((line) => console.log(line))
  process.exitCode = outcome.ok ? 0 : 1
}
