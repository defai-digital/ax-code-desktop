#!/usr/bin/env node
// Read-only editor/selection verification against two isolated fixture projects.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyProjectScheduleTargets({ session, e2e }) {
    const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
    const projects = [e2e.scenario.project, e2e.scenario.portfolio[0].project]
    const tasks = projects.map((project, index) => ({
      task: {
        id: "st_same_id", projectID: project.id, directory: project.worktree, title: "Nightly",
        prompt: `Fixture schedule for project ${index === 0 ? "A" : "B"}`,
        schedule: { type: "daily", time: "09:00", timezone: "UTC" }, status: "active", catchUpPolicy: "run_once",
        nextRunAt: Date.now() + 3600000, time: { created: Date.now() },
      }, history: [],
    }))
    const seeded = await fetch(`${origin}/__e2e__/scheduled-tasks`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tasks }),
    })
    if (!seeded.ok) throw new Error("Could not seed scheduled definitions")
    await session.send("Page.reload", { ignoreCache: true })
    await journeyBoot({ session })
    const audit = new SettingsWebMcpAudit(session)
    await audit.client.enable()
    await audit.wait('document.querySelectorAll("[data-scheduled-task-row]").length === 2', "two scoped scheduled definitions")
    const capture = async (name) => {
      const state = await audit.all()
      const inspection = await session.evaluate(`(() => {
        const describe = element => ({text: element?.innerText ?? '', width: element?.clientWidth ?? 0, scrollWidth: element?.scrollWidth ?? 0,
          name: element?.getAttribute('aria-label'), expanded: element?.getAttribute('aria-expanded')});
        const header = document.querySelector('[data-projects-home-header]');
        const rect = element => { const r = element?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null; };
        return { home: {heading: rect(header?.querySelector('h2')), bounds: rect(header),
            actions: Array.from(header?.querySelectorAll('button') ?? []).map(button => ({name: button.getAttribute('aria-label') || button.textContent, ...rect(button)}))},
          schedules: Array.from(document.querySelectorAll('[data-scheduled-task-row]')).map(describe),
          projects: ${JSON.stringify(projects)}.map(project => {
            const header = Array.from(document.querySelectorAll('[data-project-header]')).find(button => button.getAttribute('aria-label')?.includes(project.worktree));
            return {id: project.id, registryId: header?.getAttribute('data-project-header'), ...describe(header)};
          }) };
      })()`)
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ state, inspection }, null, 2))
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
      return { state, inspection }
    }
    const verify = ({ state, inspection }) => {
      for (const project of projects) {
        if (!inspection.schedules.some(row => row.text.includes(project.worktree))) throw new Error("Scheduled project context is ambiguous")
        const header = inspection.projects.find(row => row.id === project.id)
        if (!header.text.includes(project.worktree)) throw new Error("Project header needs visible directory context")
        const edits = state.controls.filter(control => control.role === "button" && control.name.startsWith("Edit Nightly") && control.name.includes(project.worktree))
        if (edits.length !== 1) throw new Error(`Ambiguous scheduled edit target for ${project.id}`)
        const headers = state.controls.filter(control => control.role === "button" && control.name.startsWith("Shared Project") && control.name.includes(project.worktree))
        if (headers.length !== 1) throw new Error(`Ambiguous project header for ${project.id}`)
      }
      if ([...inspection.schedules, ...inspection.projects].some(row => row.scrollWidth > row.width + 1)) throw new Error("Project/schedule target overflows")
      const { heading, bounds, actions } = inspection.home
      if (!heading || !bounds || actions.length !== 4) throw new Error("Missing Projects Home toolbar")
      for (const button of actions) {
        const overlaps = button.left < heading.right && button.right > heading.left && button.top < heading.bottom && button.bottom > heading.top
        if (overlaps || button.left < bounds.left - 1 || button.right > bounds.right + 1) throw new Error("Projects Home toolbar overlaps or escapes its container")
      }
    }
    verify(await capture("targets-wide"))
    for (const entry of tasks.slice().reverse()) {
      const edit = (await audit.all()).controls.find(control => control.name.startsWith("Edit Nightly") && control.name.includes(entry.task.directory))
      await audit.click(edit.name, { role: "button" })
      await audit.wait(`document.querySelector('#sched-prompt')?.value === ${JSON.stringify(entry.task.prompt)} &&
        document.querySelector('[role="dialog"]')?.textContent.includes(${JSON.stringify(entry.task.directory)})`, "correct scheduled editor")
      await capture(`editor-${entry.task.projectID}`)
      await audit.click("Cancel")
      await audit.wait('!document.querySelector("#sched-name")', "scheduled editor closed")
    }
    for (const project of projects) {
      const header = (await audit.all()).controls.find(control => control.name.startsWith("Shared Project") && control.name.includes(project.worktree))
      await audit.click(header.name, { role: "button" })
      await audit.wait(`Array.from(document.querySelectorAll('[data-project-header]')).find(button => button.getAttribute('aria-label') === ${JSON.stringify(header.name)})?.getAttribute('aria-expanded') === 'false'`, "selected project collapsed")
      const other = projects.find(entry => entry.id !== project.id)
      await audit.wait(`Array.from(document.querySelectorAll('[data-project-header]')).find(button => button.getAttribute('aria-label')?.includes(${JSON.stringify(other.worktree)}))?.getAttribute('aria-expanded') === 'true'`, "other project stays expanded")
      await audit.click(header.name, { role: "button" })
      await audit.wait(`Array.from(document.querySelectorAll('[data-project-header]')).find(button => button.getAttribute('aria-label') === ${JSON.stringify(header.name)})?.getAttribute('aria-expanded') === 'true'`, "selected project restored")
    }
    await audit.click("New scheduled task")
    for (const project of projects.slice().reverse()) {
      const matches = (await audit.all()).controls.filter(control => control.role === "menuitem" && control.name.includes(project.worktree))
      if (matches.length !== 1) throw new Error("Ambiguous scheduled project picker")
    }
    await capture("project-picker")
    const chosen = (await audit.all()).controls.find(control => control.role === "menuitem" && control.name.includes(projects[1].worktree))
    await audit.click(chosen.name, { role: "menuitem" })
    await audit.wait(`document.querySelector('#sched-name')?.value === '' && document.querySelector('[role="dialog"]')?.textContent.includes(${JSON.stringify(projects[1].worktree)})`, "new schedule for selected project")
    await audit.click("Cancel")
    for (const width of [800, 600]) {
      await session.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      await audit.wait('Boolean(document.querySelector(\'aside[aria-hidden="true"] [data-project-id]\'))', "responsive collapse")
      await audit.click("Open sessions")
      await audit.wait(`Array.from(document.querySelectorAll('[data-project-header]')).filter(button => !button.closest('[aria-hidden="true"], [inert]') &&
        button.getBoundingClientRect().right <= button.closest('aside').getBoundingClientRect().right + 1).length >= 2`, "visible project headers")
      verify(await capture(`targets-${width}`))
    }
    await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
    await audit.click("Settings")
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.click("Close settings")
    await audit.wait('!document.querySelector("[data-settings-view]")', "settings closed")
    verify(await capture("targets-light"))
    const persisted = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
    if (persisted.writes.length || persisted.createAttempts || JSON.stringify(persisted.tasks) !== JSON.stringify(tasks)) throw new Error("Read-only target journey changed scheduled definitions")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "target-receipt.json"), JSON.stringify({ persisted, actions: audit.calls }, null, 2))
    return { name: "project-schedule-targets", ok: true, detail: "Distinct project headers and scheduled targets select correct editors; no scheduled writes" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
