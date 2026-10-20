#!/usr/bin/env node
// Native WebMCP discovers/actions controls; CDP supplies physical keyboard events.
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true,
  journeys: [journeyBoot, async function journeyShortcutCapture({ session, e2e }) {
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const keyboard = []
    await session.send("Page.bringToFront")
    await audit.wait("document.hasFocus()", "test window focus")
    await audit.client.enable()
    await audit.click("Settings")
    await audit.page("Shortcuts")
    await audit.fill("Search Keyboard Shortcuts", "Open command palette")
    const field = 'input[aria-label="Open command palette"]'
    const controls = (await audit.all()).controls
    const save = controls.find(control => control.role === "button" && control.name.toLowerCase().startsWith("save changes:") && control.name.endsWith(": Open command palette"))?.name
    const reset = controls.find(control => control.role === "button" && control.name.toLowerCase().startsWith("reset:") && control.name.endsWith(": Open command palette"))?.name
    if (!save || !reset) throw new Error("Missing shortcut row actions")
    const value = () => session.evaluate(`document.querySelector(${JSON.stringify(field)})?.value`)
    const press = async (key, code, virtualKey, modifiers = 0) => {
      for (const type of ["rawKeyDown", "keyUp"]) {
        await session.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey, modifiers })
      }
      keyboard.push({ key, code, modifiers })
    }
    const capture = async (name) => {
      const page = await audit.capture(name)
      if (args.artifacts) await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({
        value: await value(), active: await session.evaluate('document.activeElement?.getAttribute("aria-label")'),
        keyboard, calls: audit.calls, page,
      }, null, 2))
    }
    const original = await value()
    await audit.click("Open command palette", { role: "input" })
    await press("Escape", "Escape", 27)
    await press("Tab", "Tab", 9)
    await capture("after-escape-tab")
    if (await value() !== original || !(await audit.find(save)).disabled) throw new Error("Escape followed by Tab must preserve the binding without creating a draft")
    if (await session.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(field)})`)) throw new Error("Escape must release shortcut capture for Tab navigation")

    await audit.click("Open command palette", { role: "input" })
    await press("Y", "KeyY", 89, (process.platform === "darwin" ? 4 : 2) | 8)
    const recorded = await value()
    await press("Tab", "Tab", 9)
    await audit.wait(`document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(save)}`, "Tab reaches enabled Save")
    if (await value() !== recorded) throw new Error("Tab overwrote the captured chord")
    await audit.click(save)
    const profile = async () => JSON.parse(await fs.readFile(e2e.settingsPath, "utf8"))
    await waitForCondition(async () => (await profile()).shortcutOverrides?.open_command_palette === "mod+shift+y",
      { timeoutMs: 10_000, label: "saved shortcut persisted" })
    const saved = (await profile()).shortcutOverrides
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "Settings closed before reload")
    await session.send("Page.reload", { ignoreCache: true })
    await journeyBoot({ session })
    await audit.client.enable()
    await waitForCondition(async () => Boolean(await audit.find("Settings", { optional: true })),
      { timeoutMs: 10_000, label: "Settings control after reload" })
    await audit.click("Settings")
    await audit.page("Shortcuts")
    await audit.fill("Search Keyboard Shortcuts", "Open command palette")
    await audit.wait(`document.querySelector(${JSON.stringify(field)})?.value === ${JSON.stringify(recorded)}`, "saved shortcut restored after reload")
    await audit.click(reset)
    await waitForCondition(async () => (await profile()).shortcutOverrides?.open_command_palette === undefined,
      { timeoutMs: 10_000, label: "shortcut reset persisted" })
    await audit.wait(`document.querySelector(${JSON.stringify(field)})?.value === ${JSON.stringify(original)}`, "default shortcut restored")
    await audit.click("Open command palette", { role: "input" })
    await press("Escape", "Escape", 27)
    await press("Enter", "Enter", 13)
    await audit.wait(`document.querySelector(${JSON.stringify(field)})?.value === 'Press keys...'`, "Enter rearms focused recorder")
    await press("Tab", "Tab", 9)
    await audit.wait(`document.querySelector(${JSON.stringify(field)})?.value === 'Tab'`, "explicit Tab capture")
    await audit.click(save)
    await audit.click("Overwrite")
    await waitForCondition(async () => {
      const overrides = (await profile()).shortcutOverrides
      return overrides?.open_command_palette === "tab" && overrides?.cycle_agent === "__unassigned__"
    }, { timeoutMs: 10_000, label: "conflicting Tab bindings reconciled" })
    const tabOverride = (await profile()).shortcutOverrides
    await audit.click("Open command palette", { role: "input" })
    await press("Escape", "Escape", 27)
    await press("Tab", "Tab", 9)
    await capture("global-tab-navigation")
    if (await session.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(field)}) || Boolean(document.querySelector('input[placeholder="Search files, sessions, commands..."]'))`)) throw new Error("Released Tab must navigate without invoking its global shortcut")
    await audit.click(reset)
    await audit.fill("Search Keyboard Shortcuts", "Cycle agent")
    const cycleReset = (await audit.all()).controls.find(control => control.role === "button" && control.name.startsWith("Reset:") && control.name.endsWith(": Cycle agent"))
    if (!cycleReset) throw new Error("Missing Cycle agent reset")
    await audit.click(cycleReset.name)
    await waitForCondition(async () => Object.keys((await profile()).shortcutOverrides ?? {}).length === 0,
      { timeoutMs: 10_000, label: "both shortcut mappings restored" })
    await audit.fill("Search Keyboard Shortcuts", "Open command palette")
    if (!(await audit.find(save)).disabled || await value() !== original) throw new Error("Reset must restore the original chord")
    await capture("shortcut-restored")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "shortcut-receipt.json"), JSON.stringify({
      original, recorded, saved, tabOverride, restored: (await profile()).shortcutOverrides, keyboard, calls: audit.calls,
    }, null, 2))
    return { name: "shortcut-capture", ok: true, detail: "Escape/chord completion release Tab navigation; rearming and explicit Tab capture work; saved chord survives reload and reset" }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
