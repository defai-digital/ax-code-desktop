#!/usr/bin/env node
// Native navigation and isolated-profile pin verification; no provider execution.
import fs from "node:fs/promises"
import { mentionsPath, pathForms } from "./paths.mjs"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyProjectHome({ session, e2e }) {
    const targets = [e2e.scenario.session, e2e.scenario.portfolio[0].session]
    const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
    const armed = await fetch(`${origin}/__e2e__/step`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "portfolio-goals" }),
    })
    if (!armed.ok) throw new Error("Could not arm portfolio goals")
    await session.send("Page.reload", { ignoreCache: true })
    await journeyBoot({ session })
    const audit = new SettingsWebMcpAudit(session)
    await audit.client.enable()
    await audit.wait('document.querySelectorAll("[data-project-row]").length >= 2', "project cards")
    const capture = async (name) => {
      const state = await audit.all()
      const rows = await session.evaluate(`Array.from(document.querySelectorAll('[data-project-row]')).map(row => ({
        directory: row.dataset.projectDirectory, name: row.getAttribute('aria-label'), current: row.getAttribute('aria-current'),
        text: row.innerText, width: row.clientWidth, scrollWidth: row.scrollWidth,
        path: (() => { const p = row.querySelector('.font-mono'); return p ? {text:p.innerText,width:p.clientWidth,scrollWidth:p.scrollWidth} : null; })(),
        controls: Array.from(row.querySelectorAll('button')).map(button => ({name:button.getAttribute('aria-label'),width:button.clientWidth,scrollWidth:button.scrollWidth}))
      }))`)
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ state, rows }, null, 2))
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
      return { state, rows }
    }
    const verify = ({ state, rows }) => {
      for (const target of targets) {
        const matches = state.controls.filter(control => control.role === "button" &&
          control.name.startsWith("Shared project · ") && mentionsPath(control.name, target.directory))
        if (matches.length !== 1) throw new Error(`Project card must identify ${target.id}`)
        const row = rows.find(row => pathForms(target.directory).includes(row.directory))
        if (!mentionsPath(row?.text, target.directory)) throw new Error("Project path must remain visible")
        if (row.scrollWidth > row.width + 1 || !row.path || row.path.scrollWidth > row.path.width + 1 ||
          row.controls.some(control => !control.name || control.scrollWidth > control.width + 1)) throw new Error("Project card context or controls overflow")
      }
    }
    const targetControl = async (prefix, directory) => {
      const controls = (await audit.all()).controls.filter(control => control.role === "button" &&
        control.name.startsWith(prefix) && mentionsPath(control.name, directory))
      if (controls.length !== 1) throw new Error(`Expected one ${prefix} target, found ${controls.length}`)
      return controls[0]
    }
    verify(await capture("home-wide"))
    // A native card click scrolls the portfolio into view through the normal
    // tool behavior. Inventory alone can include controls below the viewport.
    await audit.click((await targetControl("Shared project · ", targets[1].directory)).name)
    await capture("home-wide-visible")
    await audit.click((await targetControl("Shared project · ", targets[0].directory)).name)
    const pinReceipts = []
    const readProfile = async () => {
      const settings = JSON.parse(await fs.readFile(e2e.settingsPath, "utf8"))
      return { activeProjectId: settings.activeProjectId, projects: settings.projects.map(project => ({
        id: project.id, path: project.path, pinned: project.pinned === true,
      })) }
    }
    const pinTarget = targets[1]
    await audit.click((await targetControl("Pin project · Shared project", pinTarget.directory)).name)
    await audit.wait(`Array.from(document.querySelectorAll('[data-project-row]'))[0]?.dataset.projectDirectory === ${JSON.stringify(pinTarget.directory)}`, "pinned card moves first")
    await audit.wait(`document.querySelector('[data-project-row][aria-current="true"]')?.dataset.projectDirectory === ${JSON.stringify(targets[0].directory)}`, "pin does not select its parent card")
    await waitForCondition(async () => {
      const settings = await readProfile()
      return settings.projects[0]?.path === pinTarget.directory && settings.projects[0]?.pinned
    }, { timeoutMs: 10_000, label: "pin persisted in isolated profile" })
    pinReceipts.push(await readProfile())
    await session.send("Page.reload", { ignoreCache: true })
    await journeyBoot({ session })
    await audit.client.enable()
    await audit.wait(`Array.from(document.querySelectorAll('[data-project-row]'))[0]?.dataset.projectDirectory === ${JSON.stringify(pinTarget.directory)}`, "pinned card survives reload")
    await audit.click((await targetControl("Unpin project · Shared project", pinTarget.directory)).name)
    await waitForCondition(async () => !(await readProfile()).projects.find(project => project.path === pinTarget.directory)?.pinned,
      { timeoutMs: 10_000, label: "unpin persisted" })
    pinReceipts.push(await readProfile())
    for (const target of targets.slice().reverse()) {
      await audit.click((await targetControl("Shared project · ", target.directory)).name)
      await audit.wait(`document.querySelector('[data-project-row][aria-current="true"]')?.dataset.projectDirectory === ${JSON.stringify(target.directory)}`, "selected card is current")
      await capture(`selected-${target.id}`)
      await audit.click((await targetControl("New session · Shared project", target.directory)).name)
      await audit.wait(`document.querySelector('[data-draft-home]') && document.querySelector('[data-project-row][aria-current="true"]')?.dataset.projectDirectory === ${JSON.stringify(target.directory)}`, "draft in selected project")
      await audit.wait(`Boolean(Array.from(document.querySelectorAll('[data-project-row]')).find(row => row.dataset.projectDirectory === ${JSON.stringify(target.directory)})?.querySelector('button[aria-label^="1 need you"]'))`, "attention control loaded")
      const attention = await targetControl("1 need you · Shared project", target.directory)
      await audit.click(attention.name)
      const marker = target.id === e2e.scenario.session.id ? "Fixture conversation for project A" : "Fixture conversation for project B"
      await audit.wait(`document.body.innerText.includes(${JSON.stringify(marker)})`, "correct attention conversation")
      await capture(`attention-${target.id}`)
      const back = await session.evaluate(String.raw`document.querySelector('[data-sidebar-new-session]')?.textContent.replace(/\s+/g,' ').trim()`)
      await audit.click(back)
      await audit.wait('document.querySelectorAll("[data-project-row]").length >= 2', "return to project cards")
    }
    for (const width of [800, 600]) {
      await session.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      await audit.wait('Boolean(document.querySelector(\'aside[aria-hidden="true"]\'))', "responsive sidebar collapse")
      await audit.click((await targetControl("Shared project · ", targets[0].directory)).name)
      verify(await capture(`home-${width}`))
    }
    await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
    await waitForCondition(async () => Boolean(await audit.find("Settings", { role: "button", optional: true })),
      { timeoutMs: 10_000, label: "Settings after responsive sidebar restoration" })
    await audit.click("Settings")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "settings closed")
    await audit.click((await targetControl("Shared project · ", targets[0].directory)).name)
    verify(await capture("home-light"))
    const finalProfile = await readProfile()
    if (finalProfile.projects.some(project => project.pinned)) throw new Error("Temporary pin was not restored")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "home-receipt.json"), JSON.stringify({ pinReceipts, finalProfile, actions: audit.calls }, null, 2))
    return { name: "project-home", ok: true, detail: "Distinct cards and child actions select the right project/session; pin survives reload and is restored" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
