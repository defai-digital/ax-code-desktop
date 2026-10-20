#!/usr/bin/env node
// Native UI verification with simulated history; this does not qualify runtime execution.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))

async function journeyScheduledHistory({ session, e2e }) {
  const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
  const directory = e2e.scenario.projectDirectory
  const now = Date.now()
  const tasks = ["running", "completed", "unavailable"].map((status, index) => ({
    task: {
      id: `st_fixture_${index}`,
      projectID: e2e.scenario.project.id,
      directory,
      title: `History ${status}`,
      prompt: "Controlled fixture only",
      schedule: { type: "daily", time: "09:00", timezone: "UTC" },
      status: "active",
      catchUpPolicy: "run_once",
      lastRunAt: now - 1000,
      nextRunAt: now + 3600000,
      time: { created: now - 10000 },
    },
    history:
      status === "unavailable"
        ? {}
        : [
            {
              id: `run_fixture_${index}`,
              taskID: `st_fixture_${index}`,
              status,
              triggerType: "manual",
              coalescedCount: 1,
              time: { created: now - 1000 },
            },
          ],
  }))
  const seeded = await fetch(`${origin}/__e2e__/scheduled-tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tasks }),
  })
  if (!seeded.ok || (await seeded.json()).count !== 3) throw new Error("Scheduled fixture seed failed")
  const foreign = await fetch(`${origin}/scheduled-task?directory=${encodeURIComponent(directory + "-foreign")}`)
  if ((await foreign.json()).length !== 0) throw new Error("Fixture leaked tasks into a foreign project")
  await session.send("Page.reload")
  await journeyBoot({ session })
  const audit = new SettingsWebMcpAudit(session)
  await audit.client.enable()
  await audit.wait('document.querySelectorAll("[data-scheduled-task-row]").length === 3', "scheduled rows loaded")
  const rows = await session.evaluate(
    `Array.from(document.querySelectorAll("[data-scheduled-task-row]")).map(e => e.innerText)`,
  )
  const unknown = rows.find((text) => text.includes("History unavailable"))
  if (!unknown?.includes("Couldn't load the run history")) throw new Error("Unavailable history was not disclosed")
  const running = rows.find((text) => text.includes("History running"))
  if (!running?.includes("Running") || running.includes("Couldn't load")) throw new Error("Running row was corrupted")
  await audit.click("Edit History unavailable")
  await audit.wait('document.querySelector("#sched-name")?.value === "History unavailable"', "correct task editor")
  await audit.click("Cancel")
  await audit.wait('!document.querySelector("#sched-name")', "editor closed")
  if (args.artifacts) {
    await fs.mkdir(args.artifacts, { recursive: true })
    await fs.writeFile(
      path.join(args.artifacts, "scheduled-history-receipt.json"),
      JSON.stringify({ rows, actions: audit.calls }, null, 2),
    )
    const { data } = await session.send("Page.captureScreenshot", { format: "png" })
    await fs.writeFile(path.join(args.artifacts, "scheduled-history.png"), Buffer.from(data, "base64"))
  }
  try {
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 800,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await audit.wait(
      `(() => {
      const label = Array.from(document.querySelectorAll('[data-scheduled-task-row] span'))
        .find(e => e.textContent === "Couldn't load the run history");
      return label && label.clientWidth > 0 && label.scrollWidth <= label.clientWidth + 1
        && getComputedStyle(label).whiteSpace !== 'nowrap';
    })()`,
      "history disclosure remains readable in narrow sidebar",
    )
    if (args.artifacts) {
      const { data } = await session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(args.artifacts, "scheduled-history-narrow.png"), Buffer.from(data, "base64"))
    }
  } finally {
    await session.send("Emulation.clearDeviceMetricsOverride")
  }
  return {
    name: "scheduled-history-webmcp",
    ok: true,
    detail: "Three fixture histories; readable unavailable disclosure; native edit/cancel; foreign scope empty",
  }
}

runHarness({ ...args, uiWebMcp: true, journeys: [journeyBoot, journeyScheduledHistory] })
  .then((result) => {
    for (const line of result.lines) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
