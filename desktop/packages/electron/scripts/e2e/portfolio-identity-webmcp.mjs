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
  portfolio: true,
  journeys: [journeyBoot, async function journeyPortfolioIdentity({ session, e2e }) {
    const network = []
    session.on("Network.responseReceived", ({ response }) => {
      if (response.url.includes("/session") || response.status >= 400) {
        network.push({ url: response.url, status: response.status })
      }
    })
    const audit = new SettingsWebMcpAudit(session)
    await audit.client.enable()
    const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
    const response = await fetch(`${origin}/__e2e__/step`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "portfolio-goals" }),
    })
    if (!response.ok) throw new Error("Could not arm portfolio goals")
    // Reload against the armed fixture so the initial goal reads see it even
    // when the first event subscription was still connecting during bootstrap.
    await session.send("Page.reload", { ignoreCache: true })
    await journeyBoot({ session })
    await audit.client.enable()
    try {
      await audit.wait('document.querySelectorAll("[data-needs-you-list] button[data-needs-you-reason]").length === 2', "two portfolio exceptions")
    } finally {
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "portfolio-network.json"), JSON.stringify(network, null, 2))
        await fs.writeFile(path.join(args.artifacts, "portfolio-controls.json"), JSON.stringify(await audit.all(), null, 2))
      }
    }
    const setViewport = async (width) => {
      await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false })
      if (width < 900) {
        // The app collapses desktop panels after its resize debounce. Observe
        // that state before reopening, so the pending collapse cannot undo it.
        await audit.wait('Boolean(document.querySelector(\'aside[aria-hidden="true"] [data-session-row]\'))', "responsive sidebar collapse")
      }
    }
    const capture = async (name) => {
      const controls = await audit.all()
      const rows = await session.evaluate(`Array.from(document.querySelectorAll('[data-needs-you-list] button[data-needs-you-reason]')).map(row => ({
        text: row.innerText, fullText: row.textContent, width: row.clientWidth, scrollWidth: row.scrollWidth
      }))`)
      const liveRows = await session.evaluate(`Array.from(document.querySelectorAll('[data-session-row]'))
        .filter(row => !row.closest('[aria-hidden="true"], [inert]') && row.checkVisibility()).map(row => ({
        id: row.dataset.sessionRow, text: row.innerText, width: row.clientWidth, scrollWidth: row.scrollWidth,
        buttons: Array.from(row.querySelectorAll('button')).map(button => ({
          name: (button.getAttribute('aria-label') || button.textContent).replace(/\\s+/g, ' ').trim(),
          text: button.innerText, width: button.clientWidth, scrollWidth: button.scrollWidth
        }))
      }))`)
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ controls, rows, liveRows }, null, 2))
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
      return { rows, liveRows }
    }
    await capture("portfolio-wide")
    const checkRows = ({ rows }) => {
      for (const target of [e2e.scenario.session, e2e.scenario.portfolio[0].session]) {
        if (!rows.some(row => row.text.includes(target.directory))) {
          throw new Error(`Needs You must visibly disambiguate duplicate project labels: ${path.basename(target.directory)}`)
        }
      }
      if (rows.some(row => row.scrollWidth > row.width + 1)) throw new Error("Needs You row overflows")
    }
    const checkLiveRows = ({ liveRows }) => {
      for (const target of [e2e.scenario.session, e2e.scenario.portfolio[0].session]) {
        const row = liveRows.find(row => row.id === target.id)
        if (!row?.text.includes(target.directory)) throw new Error(`Live row must visibly identify ${target.id}`)
        const button = row.buttons.find(button => button.name.includes(target.title))
        if (!button?.text.includes(target.directory)) throw new Error(`Live action must identify ${target.id}`)
        if (row.scrollWidth > row.width + 1 || button.scrollWidth > button.width + 1) throw new Error("Live row overflows")
      }
    }
    checkLiveRows(await capture("live-wide"))
    for (const width of [800, 600]) {
      await setViewport(width)
      checkRows(await capture(`portfolio-${width}`))
    }
    await setViewport(1280)
    for (const [target, marker] of [
      [e2e.scenario.portfolio[0].session, "Fixture conversation for project B"],
      [e2e.scenario.session, "Fixture conversation for project A"],
    ]) {
      const names = (await capture(`needs-you-before-${target.id}`)).rows.map(row => row.fullText.replace(/\s+/g, " ").trim())
      const matches = (await audit.all()).controls.filter(control =>
        control.role === "button" && control.name.includes(target.title) && control.name.includes(target.directory) &&
        names.some(name => name.startsWith(control.name)))
      if (matches.length !== 1) throw new Error(`Expected one unambiguous action for ${target.id}, found ${matches.length}`)
      await audit.click(matches[0].name, { role: "button" })
      await audit.wait(`document.body.innerText.includes(${JSON.stringify(marker)})`, `correct conversation for ${target.id}`)
      await capture(`opened-${target.id}`)
      const newSession = await session.evaluate(`document.querySelector('[data-sidebar-new-session]')?.textContent.replace(/\\s+/g, ' ').trim()`)
      if (!newSession) throw new Error("Missing new-session navigation")
      await audit.click(newSession, { role: "button" })
      await audit.wait('document.querySelectorAll("[data-needs-you-list] button[data-needs-you-reason]").length === 2', "return to portfolio exceptions")
    }
    await capture("portfolio-returned")
    const ensureSidebar = async () => {
      if (!(await audit.find("Session display mode", { optional: true }))) {
        await audit.click("Open sessions")
      }
      await audit.wait(`Array.from(document.querySelectorAll('[data-session-row]')).filter(row =>
        !row.closest('[aria-hidden="true"], [inert]') && row.checkVisibility() &&
        row.getBoundingClientRect().right <= (row.closest('aside')?.getBoundingClientRect().right ?? innerWidth) + 1
        ).length === 2`, "visible Live sidebar")
    }
    const checkLiveNavigation = async (mode) => {
      for (const [target, marker] of [
        [e2e.scenario.portfolio[0].session, "Fixture conversation for project B"],
        [e2e.scenario.session, "Fixture conversation for project A"],
      ]) {
        await ensureSidebar()
        const { liveRows } = await capture(`live-${mode}-before-${target.id}`)
        const row = liveRows.find(row => row.id === target.id)
        const name = row?.buttons.find(button => button.name.includes(target.title))?.name
        if (!name?.includes(target.directory)) throw new Error(`Missing distinct Live action for ${target.id}`)
        const matches = (await audit.all()).controls.filter(control =>
          control.role === "button" && control.name.includes(target.directory) && name.startsWith(control.name))
        if (matches.length !== 1) throw new Error(`Ambiguous Live action for ${target.id}: ${matches.length}`)
        await audit.click(matches[0].name, { role: "button" })
        await audit.wait(`document.body.innerText.includes(${JSON.stringify(marker)})`, `Live ${mode} navigation to ${target.id}`)
        await capture(`live-${mode}-opened-${target.id}`)
      }
      await ensureSidebar()
      const name = await session.evaluate(`document.querySelector('[data-sidebar-new-session]')?.textContent.replace(/\\s+/g, ' ').trim()`)
      await audit.click(name, { role: "button" })
      await audit.wait('document.querySelectorAll("[data-needs-you-list] button[data-needs-you-reason]").length === 2', "return from Live")
    }
    for (const width of [800, 600]) {
      await setViewport(width)
      await ensureSidebar()
      checkLiveRows(await capture(`live-default-${width}`))
    }
    await setViewport(1280)
    await checkLiveNavigation("default")
    await ensureSidebar()
    await audit.click("Session display mode")
    await audit.click("Minimal", { role: "menuitem" })
    await audit.wait('document.querySelectorAll(\'[data-session-row][data-session-display-mode="minimal"]\').length === 2', "minimal Live rows")
    for (const width of [800, 600]) {
      await setViewport(width)
      await ensureSidebar()
      checkLiveRows(await capture(`live-minimal-${width}`))
    }
    await setViewport(1280)
    await checkLiveNavigation("minimal")
    await audit.click("Settings")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "settings closed")
    await setViewport(600)
    checkRows(await capture("portfolio-600-light"))
    await ensureSidebar()
    checkLiveRows(await capture("live-600-light"))
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "portfolio-calls.json"), JSON.stringify(audit.calls, null, 2))
    return { name: "portfolio-identity-webmcp", ok: true, detail: "Needs You and Live identify duplicate projects at narrow widths; default/minimal Live actions open their own conversations and return" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
