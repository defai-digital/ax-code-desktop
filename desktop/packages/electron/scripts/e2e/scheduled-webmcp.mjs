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
      model: { providerID: "fixture", modelID: "fixture-model" },
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
  await audit.click("UTC")
  await audit.click("UTC", { role: "option" })
  await audit.click("Daily")
  await audit.click("Weekly", { role: "option" })
  await audit.click("UTC")
  await audit.click("UTC", { role: "option" })
  await audit.click("Weekly")
  await audit.click("Daily", { role: "option" })
  await audit.click("Add time")
  await audit.wait("document.querySelectorAll('input[aria-label=\"Hours\"]').length === 2", "two schedule times")
  await audit.click("Save")
  await audit.wait('!document.querySelector("#sched-name")', "schedule saved")
  const persisted = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  const members = persisted.tasks.filter(({ task }) => task.title.startsWith("History unavailable"))
  if (
    members.length !== 2 ||
    members.some(({ task }) => task.schedule.type !== "daily" || task.schedule.timezone !== "UTC")
  )
    throw new Error("Saved family did not retain two daily UTC slots")
  if (new Set(members.map(({ task }) => task.schedule.time)).size !== 2)
    throw new Error("Saved family duplicated its time slot")
  if (persisted.writes.length !== 2 || persisted.writes.some((write) => write.directory !== directory))
    throw new Error("Unexpected scheduled writes or project scope")
  await audit.wait(
    `(() => {
      const button = document.querySelector('button[aria-label="Edit History unavailable"]');
      return button && !button.disabled && !button.closest('[hidden], [inert], [aria-hidden="true"]');
    })()`,
    "saved family available after dialog exit",
  )
  await audit.click("Edit History unavailable")
  await audit.wait("document.querySelectorAll('input[aria-label=\"Hours\"]').length === 2", "saved family reopened")
  await audit.click("Cancel")
  await audit.wait('!document.querySelector("#sched-name")', "editor closed")
  if (args.artifacts) {
    await fs.mkdir(args.artifacts, { recursive: true })
    await fs.writeFile(
      path.join(args.artifacts, "scheduled-history-receipt.json"),
      JSON.stringify({ rows, actions: audit.calls, writes: persisted.writes }, null, 2),
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
    detail: "History disclosure; daily/weekly UTC; two-slot save/reopen; native edit/cancel; foreign scope empty",
  }
}

async function journeyScheduledDstGap({ session, e2e }) {
  const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
  const directory = e2e.scenario.projectDirectory
  const year = new Date().getUTCFullYear() + 1
  const day = 8 + ((7 - new Date(Date.UTC(year, 2, 1)).getUTCDay()) % 7)
  const runAt = Date.UTC(year, 2, day, 6, 30) // 01:30 before New York's spring gap.
  await fetch(`${origin}/__e2e__/scheduled-tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tasks: [
        {
          task: {
            id: "st_dst",
            projectID: e2e.scenario.project.id,
            directory,
            title: "DST boundary",
            prompt: "Controlled fixture only",
            model: { providerID: "fixture", modelID: "fixture-model" },
            schedule: { type: "once", runAt },
            nextRunAt: runAt,
            status: "active",
            catchUpPolicy: "run_once",
            time: { created: Date.now() },
          },
          history: [],
        },
      ],
    }),
  })
  await session.send("Emulation.setTimezoneOverride", { timezoneId: "America/New_York" })
  try {
    await session.send("Page.reload")
    await journeyBoot({ session })
    const audit = new SettingsWebMcpAudit(session)
    await audit.client.enable()
    await audit.wait('document.querySelectorAll("[data-scheduled-task-row]").length === 1', "DST fixture loaded")
    await audit.click("Edit DST boundary")
    await audit.wait('document.querySelector(\'input[aria-label="Hours"]\')?.value === "01"', "before-gap wall clock")
    await audit.fill("Hours", "02")
    await audit.fill("Minutes", "30")
    await audit.click("Save")
    await audit.wait(
      `!document.querySelector("#sched-name") || document.body.innerText.includes("Failed to update task")`,
      "gap save response",
    )
    const rejected = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
    if (args.artifacts) {
      await fs.mkdir(args.artifacts, { recursive: true })
      await fs.writeFile(
        path.join(args.artifacts, "dst-gap-receipt.json"),
        JSON.stringify({ year, day, writes: rejected.writes }, null, 2),
      )
    }
    if (rejected.writes.length || !(await session.evaluate('Boolean(document.querySelector("#sched-name"))')))
      throw new Error("Nonexistent 02:30 was silently accepted instead of retaining the invalid draft")
    await audit.wait('Boolean(document.querySelector("#sched-name"))', "invalid draft retained")
    if (args.artifacts) {
      const { data } = await session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(args.artifacts, "dst-invalid-draft.png"), Buffer.from(data, "base64"))
    }
    await audit.fill("Hours", "03")
    await audit.click("Save")
    await audit.wait('!document.querySelector("#sched-name")', "valid after-gap time saved")
    const corrected = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
    if (corrected.writes.length !== 1 || corrected.tasks[0].task.schedule.runAt !== Date.UTC(year, 2, day, 7, 30))
      throw new Error("Corrected 03:30 did not save the expected instant")
    if (args.artifacts)
      await fs.writeFile(
        path.join(args.artifacts, "dst-corrected-receipt.json"),
        JSON.stringify({ year, day, writes: corrected.writes, actions: audit.calls }, null, 2),
      )
    return {
      name: "scheduled-dst-gap",
      ok: true,
      detail: "Nonexistent 02:30 rejected without writes; corrected 03:30 saved at expected instant",
    }
  } finally {
    await session.send("Emulation.setTimezoneOverride", { timezoneId: "" })
  }
}

runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [
    journeyBoot,
    ...(process.argv.includes("--dst-only") ? [] : [journeyScheduledHistory]),
    journeyScheduledDstGap,
  ],
})
  .then((result) => {
    for (const line of result.lines) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
