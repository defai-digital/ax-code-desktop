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
    const capture = async (name) => {
      const controls = await audit.all()
      const rows = await session.evaluate(`Array.from(document.querySelectorAll('[data-needs-you-list] button[data-needs-you-reason]')).map(row => ({
        text: row.innerText, fullText: row.textContent, width: row.clientWidth, scrollWidth: row.scrollWidth
      }))`)
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ controls, rows }, null, 2))
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
      return rows
    }
    await capture("portfolio-wide")
    const checkRows = (rows) => {
      for (const target of [e2e.scenario.session, e2e.scenario.portfolio[0].session]) {
        if (!rows.some(row => row.text.includes(target.directory))) {
          throw new Error(`Needs You must visibly disambiguate duplicate project labels: ${path.basename(target.directory)}`)
        }
      }
      if (rows.some(row => row.scrollWidth > row.width + 1)) throw new Error("Needs You row overflows")
    }
    for (const width of [800, 600]) {
      await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false })
      checkRows(await capture(`portfolio-${width}`))
    }
    await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    for (const [target, marker] of [
      [e2e.scenario.portfolio[0].session, "Fixture conversation for project B"],
      [e2e.scenario.session, "Fixture conversation for project A"],
    ]) {
      const matches = (await audit.all()).controls.filter(control =>
        control.role === "button" && control.name.includes(target.title) && control.name.includes(target.directory))
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
    await audit.click("Settings")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "settings closed")
    await session.send("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: false })
    checkRows(await capture("portfolio-600-light"))
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "portfolio-calls.json"), JSON.stringify(audit.calls, null, 2))
    return { name: "portfolio-identity-webmcp", ok: true, detail: "Duplicate project identity remains visible in narrow rows; each native action opens its own conversation and returns" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
