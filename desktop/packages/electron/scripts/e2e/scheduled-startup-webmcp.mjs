#!/usr/bin/env node
// Startup failure/retry through the native UI; runtime HTTP is an isolated fixture.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))

async function journeyScheduledStartup({ session }) {
  let refuse = true
  let reads = 0
  const errors = []
  session.on("Fetch.requestPaused", (event) => {
    reads += 1
    void session
      .send("Fetch.fulfillRequest", {
        requestId: event.requestId,
        responseCode: refuse ? 503 : 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(refuse ? { error: "Controlled runtime startup failure" } : [])).toString(
          "base64",
        ),
      })
      .catch((error) => errors.push(String(error)))
  })
  await session.send("Fetch.enable", { patterns: [{ urlPattern: "*/scheduled-task*", requestStage: "Request" }] })
  await session.send("Network.enable")
  await session.send("Network.setBlockedURLs", { urls: ["*/global/event*", "*/api/event*"] })
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
    if (!reads) throw new Error("Startup fixture was not read")
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
    refuse = false
    const before = reads
    await audit.click(retry.name)
    await audit.wait(
      '!document.querySelector("[data-sidebar-scheduled] [role=alert], [data-sidebar-scheduled] [aria-busy=true]")',
      "retry recovered before stream connect",
    )
    if (reads <= before || errors.length) throw new Error("Fixture retry was not completed: " + errors.join(", "))
    await audit.capture("Scheduled retry recovered")
    if (args.artifacts) {
      await fs.writeFile(
        path.join(args.artifacts, "startup-receipt.json"),
        JSON.stringify(
          {
            reads,
            errors,
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
    await session.send("Fetch.disable")
    await session.send("Network.setBlockedURLs", { urls: [] })
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
