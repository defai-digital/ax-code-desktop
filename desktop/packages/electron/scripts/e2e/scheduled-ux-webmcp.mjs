#!/usr/bin/env node
// Native scheduling UX qualification with an isolated runtime fixture; no provider execution.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { setDesktopViewport } from "./desktop-viewport.mjs"

const args = parseArgs(process.argv.slice(2))
async function journeyScheduledUx({ session, e2e }) {
  const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
  const audit = new SettingsWebMcpAudit(session)
  const seed = async (tasks) => {
    const response = await fetch(`${origin}/__e2e__/scheduled-tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tasks, fixtureModel: true }),
    })
    if (!response.ok) throw new Error("Could not seed schedule UX fixture")
    await session.send("Page.reload")
    await journeyBoot({ session })
    await audit.client.enable()
  }
  const capture = async (name) => {
    if (!args.artifacts) return
    await fs.mkdir(args.artifacts, { recursive: true })
    await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify(await audit.all(), null, 2))
    const { data } = await session.send("Page.captureScreenshot", { format: "png" })
    await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
  }
  const confirmation = () => session.evaluate('document.querySelector("[data-scheduled-confirmation]")?.textContent')
  const showConfirmation = async () => {
    const point = await session.evaluate(`(() => {
      const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect()
      return { x: dialog.x + dialog.width / 2, y: dialog.y + dialog.height / 2 }
    })()`)
    await session.send("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: 1500 })
    await audit.wait(
      `(() => {
      const summary = document.querySelector('[data-scheduled-confirmation]')?.getBoundingClientRect()
      const save = Array.from(document.querySelectorAll('[role="dialog"] button')).find(e => e.textContent === 'Save')?.getBoundingClientRect()
      return summary && save && summary.top >= 0 && summary.bottom <= save.top && save.bottom <= innerHeight
    })()`,
      "visible schedule confirmation and save",
    )
  }
  await seed([])
  await setDesktopViewport(session, { width: 1280, height: 900 })
  await audit.wait('Boolean(document.querySelector("[data-scheduled-empty]"))', "loaded empty guidance")
  await capture("schedule-empty-dark")
  await audit.click("New scheduled task")
  await audit.wait('Boolean(document.querySelector("#sched-name"))', "project-scoped create form")
  await audit.wait(
    'document.querySelector("[data-scheduled-project-context]")?.textContent.includes("Project")',
    "create project context",
  )
  const ordered = await session.evaluate(`(() => {
    const name = document.querySelector('#sched-name'), prompt = document.querySelector('#sched-prompt')
    const type = Array.from(document.querySelectorAll('[role="dialog"] label')).find(e => e.textContent === 'Schedule type')
    return !!name && !!prompt && !!type && !!(name.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(prompt.compareDocumentPosition(type) & Node.DOCUMENT_POSITION_FOLLOWING)
  })()`)
  if (!ordered) throw new Error("Task intent must precede schedule controls")
  await capture("schedule-create-intent-dark")
  await audit.click("Cancel")
  await audit.wait('!document.querySelector("#sched-name")', "create cancelled")
  const now = Date.now()
  const task = {
    id: "st_ux",
    projectID: e2e.scenario.project.id,
    directory: e2e.scenario.projectDirectory,
    title: "Daily check",
    prompt: "Controlled fixture only",
    status: "active",
    catchUpPolicy: "run_once",
    model: { providerID: "fixture", modelID: "fixture-model" },
    schedule: { type: "daily", time: "09:00", timezone: "UTC" },
    nextRunAt: now + 3600000,
    time: { created: now },
  }
  await seed([{ task, history: [] }])
  await audit.wait(
    'document.querySelector("[data-scheduled-task-timing]")?.textContent.includes("Next in")',
    "runtime-derived next run",
  )
  const foreignControl = await fetch(
    `${origin}/scheduled-task/st_ux/pause?directory=${encodeURIComponent(task.directory + "-foreign")}`,
    { method: "POST" },
  )
  if (foreignControl.status !== 404) throw new Error("Fixture accepted a foreign-project control action")
  await audit.click("More actions for Daily check")
  // The timing must remain visible while the action menu is open.
  const timing = await session.evaluate(`(() => {
    const e = document.querySelector('[data-scheduled-task-timing]')
    return { text: e?.textContent, visible: e?.checkVisibility(), width: e?.getBoundingClientRect().width }
  })()`)
  if (!timing.visible || !timing.width || !timing.text.includes("Next in"))
    throw new Error("Actions hid next-run timing")
  await capture("schedule-actions-dark")
  await audit.click("Pause", { role: "menuitem" })
  await audit.wait('document.querySelector("[data-scheduled-task-timing]")?.textContent === "Paused"', "paused state")
  let persisted = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  if (persisted.tasks[0].task.status !== "paused") throw new Error("Pause was not persisted")
  await audit.click("Edit Daily check")
  await audit.wait('Boolean(document.querySelector("[data-scheduled-confirmation]"))', "schedule confirmation")
  if (!(await confirmation()).includes("Automatic runs are off"))
    throw new Error("Paused draft did not disclose automatic runs are off")
  await audit.click("Daily")
  await audit.click("Weekly", { role: "option" })
  await audit.click("Add time")
  await audit.wait("document.querySelectorAll('input[aria-label=\"Hours\"]').length === 2", "two weekly slots")
  const weekly = await confirmation()
  if (!weekly.includes("UTC") || !weekly.includes("09:00") || !weekly.includes("catch-up"))
    throw new Error(`Incomplete weekly confirmation: ${weekly}`)
  await showConfirmation()
  await capture("schedule-weekly-confirmation-dark")
  await audit.click("Save")
  await audit.wait('!document.querySelector("#sched-name")', "weekly edit saved")
  persisted = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  if (
    persisted.tasks.length !== 2 ||
    persisted.tasks.some(
      ({ task }) => task.schedule.type !== "weekly" || task.status !== "paused" || task.schedule.timezone !== "UTC",
    )
  ) {
    throw new Error("Weekly edit did not preserve paused state and UTC for both slots")
  }
  await audit.click("Edit Daily check")
  await audit.wait(
    "document.querySelectorAll('input[aria-label=\"Hours\"]').length === 2",
    "saved weekly slots reopened",
  )
  await audit.click("Weekly")
  await audit.click("One-time", { role: "option" })
  const once = await confirmation()
  if (!once.includes("One-time") || !once.includes("UTC"))
    throw new Error("One-time confirmation lost the selected zone")
  await audit.click("Cancel")
  await audit.wait('!document.querySelector("#sched-name")', "one-time draft cancelled")
  await audit.click("Settings")
  await audit.page("Appearance")
  await audit.click("Light")
  await audit.click("Close settings")
  await audit.wait(
    '!Array.from(document.querySelectorAll("[data-settings-view]")).some(e => e.checkVisibility({ opacityProperty: true }) && !e.closest("[data-ending-style]"))',
    "settings closed",
  )
  await setDesktopViewport(session, { width: 800, height: 700 })
  if (!(await audit.find("Edit Daily check", { optional: true }))) await audit.click("Open sessions")
  await audit.click("Edit Daily check")
  await showConfirmation()
  await capture("schedule-confirmation-light-800")
  await audit.click("Cancel")
  await audit.wait('!document.querySelector("#sched-name")', "light editor closed")
  await audit.click("More actions for Daily check")
  await audit.click("Resume", { role: "menuitem" })
  await audit.wait('document.querySelector("[data-scheduled-task-timing]")?.textContent !== "Paused"', "resumed state")
  persisted = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  if (persisted.tasks.some(({ task }) => task.status !== "active"))
    throw new Error("Resume did not persist for every family member")
  await capture("schedule-resumed-light-800")
  await setDesktopViewport(session, { width: 1280, height: 900 })
  await seed([
    {
      task: { ...task, title: "Monthly check", schedule: { type: "cron", expression: "30 9 1 * *", timezone: "UTC" } },
      history: [],
    },
  ])
  await audit.wait('Boolean(document.querySelector("[data-scheduled-task-row]"))', "cron fixture loaded")
  await audit.click("Edit Monthly check")
  await audit.wait(
    'document.querySelector("[data-scheduled-confirmation]")?.textContent.includes("30 9 1 * *")',
    "canonical cron confirmation",
  )
  const promptName = (await audit.all()).controls.find(
    (control) => control.role === "textarea" && control.name.startsWith("Prompt"),
  )?.name
  if (!promptName) throw new Error("Missing prompt field")
  await audit.fill(promptName, "Updated fixture instructions")
  await audit.click("Save")
  await audit.wait('!document.querySelector("#sched-name")', "prompt-only cron save")
  const cron = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  if (
    cron.writes.length !== 1 ||
    Object.hasOwn(cron.writes[0].fields, "schedule") ||
    cron.tasks[0].task.schedule.type !== "cron"
  ) {
    throw new Error("A prompt-only edit rewrote the irregular schedule")
  }
  await audit.click("Edit Monthly check")
  await audit.click("Add time")
  await audit.wait(
    'document.querySelector("[data-scheduled-confirmation]")?.textContent.includes("Daily") && !document.querySelector("[data-scheduled-confirmation]")?.textContent.includes("30 9 1 * *")',
    "edited recurrence replaces canonical confirmation",
  )
  await audit.click("Cancel")
  if (args.artifacts)
    await fs.writeFile(
      path.join(args.artifacts, "schedule-ux-receipt.json"),
      JSON.stringify({ ordered, timing, weekly, once, persisted, cron, actions: audit.calls }, null, 2),
    )
  return {
    name: "scheduled-ux",
    ok: true,
    detail:
      "Empty/create intent; stable timing; pause/weekly save/reopen/resume with persisted readback; once confirmation; light/dark and narrow layout",
  }
}
const result = await runHarness({ ...args, uiWebMcp: true, journeys: [journeyBoot, journeyScheduledUx] })
for (const line of result.lines) console.log(line)
process.exitCode = result.ok ? 0 : 1
