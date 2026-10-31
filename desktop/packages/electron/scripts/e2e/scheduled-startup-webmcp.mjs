#!/usr/bin/env node
// Startup failure/retry through the native UI; runtime HTTP is an isolated fixture.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))

async function journeyScheduledStartup({ session, e2e }) {
  const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
  const availability = `${origin}/__e2e__/startup-availability`
  const configure = async (scheduledReads, events = false) => {
    const response = await fetch(availability, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledReads, events }),
    })
    if (!response.ok) throw new Error("Startup fixture configuration failed")
  }
  await configure(false)
  const script = await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const realNow = Date.now.bind(Date);
      window.__startupClockOffset = 0;
      Date.now = () => realNow() + window.__startupClockOffset;
    })()`,
  })
  const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
  try {
    await session.send("Page.reload")
    await journeyBoot({ session })
    await audit.client.enable()
    await audit.wait(
      'Boolean(document.querySelector("[data-sidebar-scheduled] [aria-busy=true]"))',
      "startup loading row",
    )
    const initial = await (await fetch(availability)).json()
    if (!initial.startupScheduledReads || initial.startupStreamAcknowledgements !== 0)
      throw new Error("Startup fixture did not refuse reads before stream connection")
    if (await session.evaluate('Boolean(document.querySelector("[data-sidebar-scheduled] [role=alert]"))')) {
      throw new Error("Startup grace failed to hide the initial refusal")
    }
    await audit.capture("Scheduled startup grace")
    await session.evaluate(
      `window.__startupClockOffset = 60_000; document.dispatchEvent(new Event("visibilitychange"))`,
    )
    await audit.wait(
      'Boolean(document.querySelector("[data-sidebar-scheduled] [role=alert]"))',
      "persistent failure disclosed",
    )
    await audit.capture("Scheduled persistent failure dark")
    const retry = (await audit.all()).controls.find((control) => control.name.startsWith("Retry loading tasks for "))
    if (!retry) throw new Error("Persistent failure did not expose a native Retry action")
    await audit.click("Settings")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "settings closed")
    await audit.capture("Scheduled persistent failure light")
    await configure(true)
    await audit.click(retry.name)
    await audit.wait(
      '!document.querySelector("[data-sidebar-scheduled] [role=alert], [data-sidebar-scheduled] [aria-busy=true]")',
      "retry recovered before stream connect",
    )
    const final = await (await fetch(availability)).json()
    if (!final.startupScheduledReads || final.startupStreamAcknowledgements !== 0)
      throw new Error("Retry was not completed before stream connection")
    await audit.capture("Scheduled retry recovered")
    if (args.artifacts) {
      await fs.writeFile(
        path.join(args.artifacts, "startup-receipt.json"),
        JSON.stringify(
          {
            initial,
            final,
            actions: audit.calls,
            scope:
              "Blocked event stream, simulated startup HTTP refusal, advanced display clock, native retry and fresh DOM/screenshots; no model execution",
          },
          null,
          2,
        ),
      )
    }
    return {
      name: "scheduled-startup",
      ok: true,
      detail:
        "Startup refusal hidden briefly, persistent failure exposes Retry, successful HTTP retry clears failure without event connection",
    }
  } finally {
    await configure(true, true)
    await session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier })
  }
}

runHarness({ ...args, uiWebMcp: true, journeys: [journeyBoot, journeyScheduledStartup] })
  .then((result) => {
    for (const line of result.lines) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
