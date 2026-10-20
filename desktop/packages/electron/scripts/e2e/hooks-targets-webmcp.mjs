#!/usr/bin/env node
// Native Settings targeting against directory-scoped Hooks data; no command execution.
import fs from "node:fs/promises"
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { waitForCondition } from "./cdp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function journeyHooksTargets({ session, e2e }) {
    const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
    const projects = [e2e.scenario.project, e2e.scenario.portfolio[0].project]
    const workspaces = projects.map((project, index) => ({
      directory: project.worktree,
      workspace: {
        trusted: true, file: { path: `${project.worktree}/.ax-code/hooks.json`, exists: true, valid: true },
        hooks: [0, 1].map(row => ({ event: "PreToolUse", matcher: "Bash", source: "project",
          command: `echo project-${index}-row-${row} ${"fixture-long-command ".repeat(9)}` })),
        packs: [{ name: `project-${index}-pack`, enabled: true, description: "Fixture only; no commands execute" }],
      },
    }))
    const seed = async (entries) => {
      const response = await fetch(`${origin}/__e2e__/hooks`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaces: entries }) })
      if (!response.ok) throw new Error("Could not seed Hooks fixture")
    }
    await seed(workspaces)
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    await session.send("Page.bringToFront")
    await audit.client.enable()
    await audit.click("Settings")
    await audit.page("Hooks")
    const waitProjectMenu = (expanded) => waitForCondition(async () =>
      (await audit.find("Switch project", { role: "button" })).expanded === String(expanded),
    { timeoutMs: 10000, label: `visible Settings project menu ${expanded ? "open" : "closed"}` })
    const openProjectMenu = async () => {
      await waitProjectMenu(false)
      await audit.click("Switch project")
      await waitProjectMenu(true)
    }
    await openProjectMenu()
    const options = (await audit.all()).controls.filter(control => control.role === "menuitemradio")
    await audit.capture("Hooks project menu")
    const defects = []
    for (const project of projects) {
      if (options.filter(control => control.name.includes(project.worktree)).length !== 1) defects.push(`Settings project target lacks directory: ${project.worktree}`)
    }
    // The harness initially selects its cwd project. Use an ordinal only to expose baseline defects;
    // passing qualification below requires unambiguous path-bearing targets.
    const initial = options.find(control => control.name.includes(projects[0].worktree)) || options.find(control => control.name === "Shared Project")
    if (!initial) throw new Error("Missing seeded Settings projects")
    await audit.click(initial.name, { role: "menuitemradio" })
    await audit.wait('document.querySelectorAll("[data-settings-view] code").length === 2', "populated Hooks")
    await audit.capture("Hooks initial")
    const expanders = (await audit.all()).controls.filter(control => control.name.startsWith("Show full command"))
    if (expanders.length !== 2 || new Set(expanders.map(control => control.name)).size !== 2) defects.push("Hook command expansion targets are indistinguishable")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "target-discovery.json"), JSON.stringify({ expanders, options, defects }, null, 2))
    if (defects.length) throw new Error(defects.join("; "))
    await openProjectMenu()
    const select = async (index) => {
      const option = (await audit.all()).controls.find(control => control.role === "menuitemradio" && control.name.includes(projects[index].worktree))
      await audit.click(option.name, { role: "menuitemradio" })
      await waitProjectMenu(false)
      await audit.wait(`document.querySelector('[data-settings-view]')?.textContent.includes(${JSON.stringify(`project-${index}-pack`)}) &&
        !document.querySelector('[data-settings-view]')?.textContent.includes(${JSON.stringify(`project-${1 - index}-pack`)})`, "correct scoped Hooks workspace")
    }
    for (const index of [1, 0]) {
      await select(index)
      const commands = (await audit.all()).controls.filter(control => control.name.startsWith("Show full command"))
      await audit.click(commands[1].name)
      await audit.wait(`(() => { const codes = document.querySelectorAll('[data-settings-view] code');
        return codes.length === 2 && codes[0].classList.contains('truncate') && !codes[1].classList.contains('truncate'); })()`, "only chosen command expanded")
      const collapse = (await audit.all()).controls.find(control => control.name.startsWith("Hide full command"))
      await audit.click(collapse.name)
      await audit.wait(`Array.from(document.querySelectorAll('[data-settings-view] code')).every(code => code.classList.contains('truncate'))`, "commands collapsed")
      await audit.capture(`Hooks project ${index}`)
      await openProjectMenu()
    }
    await select(0)
    const before = (await (await fetch(`${origin}/__e2e__/hooks`)).json()).reads.length
    await audit.click("Refresh hooks")
    await audit.wait(`!document.querySelector('[aria-label="Refresh hooks"]')?.disabled`, "refresh completed")
    const after = (await (await fetch(`${origin}/__e2e__/hooks`)).json()).reads
    if (after.length !== before + 1 || after.at(-1).directory !== projects[0].worktree) throw new Error("Refresh used wrong project or did not read")
    await seed([{ ...workspaces[0], status: 503, workspace: { message: "Fixture refresh unavailable" } }, workspaces[1]])
    await audit.click("Refresh hooks")
    await audit.wait(`Boolean(document.querySelector('[data-settings-view] [role="alert"]')) && document.body.textContent.includes('project-0-pack')`, "failed refresh retains prior workspace")
    await audit.capture("Hooks refresh error")
    await seed(workspaces)
    await audit.click("Retry")
    await audit.wait(`!document.querySelector('[data-settings-view] [role="alert"]') && !document.querySelector('[aria-label="Refresh hooks"]')?.disabled`, "retry recovered")
    await seed([{ ...workspaces[0], delayMs: 5000 }, workspaces[1]])
    await audit.click("Refresh hooks")
    await openProjectMenu()
    await select(1)
    const pendingReads = await (await fetch(`${origin}/__e2e__/hooks`)).json()
    if (!pendingReads.reads.some(read => read.directory === projects[0].worktree && !read.completed) ||
        !pendingReads.reads.some(read => read.directory === projects[1].worktree && read.completed)) {
      throw new Error("Late-response scenario did not establish an outstanding old-project read")
    }
    await waitForCondition(async () => {
      const { reads } = await (await fetch(`${origin}/__e2e__/hooks`)).json()
      return reads.some(read => read.directory === projects[0].worktree && read.completed)
    }, { timeoutMs: 8000, label: "old project refresh response completed" })
    await audit.wait(`document.body.textContent.includes('project-1-pack') && !document.body.textContent.includes('project-0-pack')`, "late response leaves selected project intact")
    await audit.capture("Hooks after late refresh")
    await openProjectMenu()
    await select(0)
    for (const width of [1280, 800]) {
      await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false })
      await audit.click((await audit.all()).controls.find(control => control.name.startsWith("Show full command")).name)
      await audit.capture(`Hooks expanded ${width} dark`)
      await audit.wait(`(() => { const codes = Array.from(document.querySelectorAll('[data-settings-view] code'));
        const expanded = codes.filter(code => !code.classList.contains('truncate'));
        return codes.length === 2 && expanded.length === 1 && expanded.every(code => code.scrollWidth <= code.clientWidth + 1); })()`, "expanded command fits")
      await audit.click((await audit.all()).controls.find(control => control.name.startsWith("Hide full command")).name)
    }
    await audit.page("Appearance")
    await audit.click("Light")
    await audit.wait('document.documentElement.classList.contains("light")', "light theme")
    await audit.page("Hooks")
    await audit.wait('document.querySelectorAll("[data-settings-view] code").length === 2', "light Hooks loaded")
    await audit.click((await audit.all()).controls.find(control => control.name.startsWith("Show full command")).name)
    await audit.capture("Hooks expanded 800 light")
    const finalReads = await (await fetch(`${origin}/__e2e__/hooks`)).json()
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "hooks-receipt.json"), JSON.stringify({ actions: audit.calls, initialRefreshReads: after, finalReads }, null, 2))
    return { name: "hooks-targets-webmcp", ok: true, detail: "Two same-name Settings projects, independent command expansion, scoped refresh, retained error data, retry and narrow/light/dark checks passed; no hooks executed" }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
