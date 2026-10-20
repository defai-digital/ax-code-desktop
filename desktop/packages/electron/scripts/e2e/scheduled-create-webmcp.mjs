#!/usr/bin/env node
// Failure-injected UI qualification only; no real provider or scheduler execution.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const lostAcknowledgement = process.argv.includes("--lost-ack")

async function journeyPartialCreate({ session, e2e }) {
  const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
  const seeded = await fetch(`${origin}/__e2e__/scheduled-tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tasks: [], failCreateAt: 2, fixtureModel: true, failAfterWrite: lostAcknowledgement }),
  })
  if (!seeded.ok) throw new Error("Scheduled fixture seed failed")
  await session.send("Page.reload")
  await journeyBoot({ session })
  const audit = new SettingsWebMcpAudit(session)
  await audit.client.enable()
  await audit.click("New scheduled task")
  if (await audit.find("Project", { role: "menuitem", optional: true })) {
    await audit.click("Project", { role: "menuitem" })
  }
  await audit.wait('Boolean(document.querySelector("#sched-name"))', "new task editor")
  const controls = (await audit.all()).controls
  const name = controls.find((control) => control.name.startsWith("Task name"))
  const prompt = controls.find((control) => control.name.startsWith("Prompt") && control.role === "textarea")
  if (!name || !prompt) throw new Error("Missing new task fields")
  await audit.fill(name.name, "Partial create")
  await audit.fill(prompt.name, "Controlled fixture only")
  if (!(await audit.find("fixture/fixture-model", { role: "button", optional: true }))) {
    await audit.click("Not selected", { index: 0 })
    await audit.wait(
      `Array.from(document.querySelectorAll('[role="option"]')).some(e => e.textContent.includes("Fixture model"))`,
      "fixture model option",
    )
    const model = (await audit.all()).controls.find(
      (control) => control.role === "option" && control.name.includes("Fixture model"),
    )
    if (!model) throw new Error("Missing fixture model")
    await audit.click(model.name, { role: "option" })
  }
  await audit.click("Not selected", { role: "button" })
  await audit.click("Not selected", { role: "menuitem" })
  await audit.click("Add time")
  await audit.click("Save")
  await audit.wait(
    `document.body.innerText.includes("Controlled create failure")
    || document.body.innerText.includes("review the scheduled tasks")`,
    "injected create failure",
  )
  await audit.wait(
    `Array.from(document.querySelectorAll('[role="dialog"] button')).some(e => e.textContent === "Save")`,
    "save request settled",
  )
  const first = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  const expectedWrites = lostAcknowledgement ? 2 : 1
  if (first.writes.length !== expectedWrites || first.createAttempts !== 2)
    throw new Error("Failure did not follow one created slot")
  const save = await audit.find("Save")
  if (!save.disabled) {
    await audit.click("Save")
    await audit.wait('!document.querySelector("#sched-name")', "unsafe retry completed")
  }
  const after = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
  if (args.artifacts) {
    await fs.mkdir(args.artifacts, { recursive: true })
    await fs.writeFile(
      path.join(args.artifacts, "partial-create-receipt.json"),
      JSON.stringify({ first, after, actions: audit.calls }, null, 2),
    )
    const { data } = await session.send("Page.captureScreenshot", { format: "png" })
    await fs.writeFile(path.join(args.artifacts, "partial-create.png"), Buffer.from(data, "base64"))
  }
  if (after.createAttempts !== 2 || after.writes.length !== expectedWrites)
    throw new Error("Retry recreated already acknowledged slots")
  await audit.wait(
    `document.querySelector("#sched-name")?.value === "Partial create"
    && document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes("Confirmed created: 1.")
    && document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes("review the scheduled tasks")`,
    "draft retained with recovery guidance",
  )
  try {
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 800,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await audit.wait(
      `(() => {
      const alert = document.querySelector('[role="dialog"] [role="alert"]');
      const cancel = Array.from(document.querySelectorAll('[role="dialog"] button')).find(e => e.textContent === "Cancel");
      if (!alert || !cancel) return false;
      const text = alert.getBoundingClientRect();
      const button = cancel.getBoundingClientRect();
      return text.top >= 0 && text.bottom <= window.innerHeight && alert.scrollWidth <= alert.clientWidth + 1
        && document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.closest("button") === cancel;
    })()`,
      "recovery guidance and cancel visible in narrow window",
    )
    if (args.artifacts) {
      const { data } = await session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(args.artifacts, "partial-create-narrow.png"), Buffer.from(data, "base64"))
    }
  } finally {
    await session.send("Emulation.clearDeviceMetricsOverride")
  }
  await audit.click("Cancel")
  await audit.wait(
    `!document.querySelector("#sched-name") &&
      Array.from(document.querySelectorAll("[data-scheduled-task-row]")).some(e => e.textContent.includes("Partial create"))`,
    "created task visible for review after closing",
  )
  return {
    name: "partial-create",
    ok: true,
    detail: "Partial create retained and disclosed; direct resubmission blocked without extra writes",
  }
}

runHarness({ ...args, uiWebMcp: true, journeys: [journeyBoot, journeyPartialCreate] })
  .then((result) => {
    for (const line of result.lines) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
