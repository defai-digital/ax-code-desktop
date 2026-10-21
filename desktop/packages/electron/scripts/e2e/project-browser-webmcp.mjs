#!/usr/bin/env node
// WebMCP task suite W1 (discover) and W2 (try a tool by hand) against the public quickstart page, served on loopback.
// The page runs in the native project browser; no agent or model is involved.
import { checkBrowserSessions } from "./project-browser-sessions.mjs"
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, "../../../../../docs/examples/webmcp-quickstart/index.html")
const EXPECTED_TOOLS = ["add_task", "complete_task", "list_tasks", "search_tasks"]

const args = parseArgs(process.argv.slice(2))
const fixture = await fs.readFile(fixturePath, "utf8")
const server = http.createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(fixture)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const secondServer = http.createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(fixture)
})
await new Promise((resolve) => secondServer.listen(0, "127.0.0.1", resolve))
const secondUrl = `http://127.0.0.1:${secondServer.address().port}/`
const pageUrl = `http://127.0.0.1:${server.address().port}/`

let outcome
try {
  outcome = await runHarness({
    ...args,
    uiWebMcp: true,
    portfolio: true,
    journeys: [
      journeyBoot,
      async function journeyProjectBrowser({ session, debuggingPort, e2e }) {
        const { scenario } = e2e
        const audit = new SettingsWebMcpAudit(session)
        await audit.client.enable()
        const sessionRow = `[data-session-row="${scenario.session.id}"]`
        await audit.wait(`Boolean(document.querySelector(${JSON.stringify(sessionRow)}))`, "scripted session row")
        await session.evaluate(
          `Array.from(document.querySelector(${JSON.stringify(sessionRow)}).querySelectorAll('button')).find(button => button.textContent.trim().startsWith(${JSON.stringify(scenario.session.title)})).click()`,
        )
        await audit.wait(
          `Boolean(document.querySelector('[aria-label="Copy session ID ${scenario.session.id}"]'))`,
          "scripted session selected",
        )
        let actions = 0
        const act = async (step) => {
          actions += 1
          return step()
        }
        const capture = async (name) => {
          if (!args.artifacts) return
          await fs.mkdir(args.artifacts, { recursive: true })
          const state = await audit.all()
          const pane = await session.evaluate(
            `document.querySelector('[data-webmcp-tool-panel]')?.closest('section')?.parentElement?.innerText ?? ''`,
          )
          await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ state, pane }, null, 2))
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
        }
        const header = (await audit.all()).controls.find(
          (control) => control.role === "button" && control.name.startsWith("Project browser (WebMCP):"),
        )
        if (!header) throw new Error("Missing the WebMCP header control")
        await act(() => audit.client.call("ax_desktop_click", { ref: header.ref }))
        await audit.wait(`Boolean(document.querySelector('#webmcp-mode-tab-agent'))`, "project browser pane")
        await act(() => audit.click("Project browser (WebMCP)", { role: "tab" }))
        await act(() => audit.fill("Project browser address", pageUrl))
        // The native view starts asynchronously; Go stays disabled until it is ready.
        await audit.wait(
          `Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Go' && !b.disabled)`,
          "project browser ready",
        )
        await act(() => audit.click("Go", { role: "button" }))
        // W1: the page's tools are listed before any agent access is granted.
        await audit.wait(
          `document.querySelector('[data-webmcp-tool-panel]')?.textContent.includes('Page tools (${EXPECTED_TOOLS.length})')`,
          "page tools listed",
        )
        await act(() => audit.click(`Page tools (${EXPECTED_TOOLS.length})`, { role: "button" }))
        const names = await session.evaluate(
          `Array.from(document.querySelectorAll('[data-webmcp-tool]')).map(e => e.dataset.webmcpTool).sort()`,
        )
        if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) throw new Error(`Unexpected tools: ${names}`)
        if (!(await audit.find("How to add page tools", { optional: true })))
          throw new Error("Missing the builder guide link")
        await capture("w1-tools")
        if (actions > 8) throw new Error(`W1 took ${actions} actions; the budget is 8`)
        const w1Actions = actions

        // W2: try a tool by hand. Input is sent exactly as typed; the page's own error comes back as an error.
        actions = 0
        const tool = `document.querySelector('[data-webmcp-tool="add_task"]')`
        await act(() => session.evaluate(`${tool}.querySelector('button[aria-expanded]').click()`))
        // The title field through its label, as a person finds it (field order and other inputs may vary).
        const titleField = `document.getElementById(Array.from(${tool}.querySelectorAll('label[for]')).find(l => l.textContent.trim().startsWith('title'))?.htmlFor ?? '')`
        await audit.wait(`Boolean(${titleField})`, "add_task form")
        const tryWith = async (title) => {
          await act(() =>
            session.evaluate(`(() => {
              const input = ${titleField}
              const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
              Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(title)})
              input.dispatchEvent(new Event('input', { bubbles: true }))
            })()`),
          )
          await session.evaluate(`${tool}.querySelector('[data-webmcp-tool-result]')?.remove()`)
          await act(() =>
            session.evaluate(
              `Array.from(${tool}.querySelectorAll('button')).find(b => b.textContent.trim() === 'Try it').click()`,
            ),
          )
          await audit.wait(
            `Boolean(${tool}.querySelector('[data-webmcp-tool-result]'))`,
            `result for ${JSON.stringify(title)}`,
          )
          return session.evaluate(
            `(() => { const r = ${tool}.querySelector('[data-webmcp-tool-result]'); return { outcome: r.dataset.webmcpToolResult, text: r.textContent } })()`,
          )
        }
        const rejected = await tryWith("   ")
        if (rejected.outcome === "completed" || rejected.outcome === "ok" || !rejected.text.includes("minLength"))
          throw new Error(`A title of only spaces must come back as the page's error, got ${JSON.stringify(rejected)}`)
        const added = await tryWith("Ship the beta")
        if (!added.text.includes("Ship the beta"))
          throw new Error(`Valid input must return the new task, got ${JSON.stringify(added)}`)
        await capture("w2-try")
        if (actions > 10) throw new Error(`W2 took ${actions} actions; the budget is 10`)
        // W5 subset: native keyboard takeover/resume, with a model-free enrolled provider.
        // The earlier manual result must survive: no page recreation, navigation or form reset.
        const w2Actions = actions
        await audit.click(`Page tools (${EXPECTED_TOOLS.length})`, { role: "button" })
        const enable = await audit.find("Enable agent access", { optional: true })
        if (!enable) throw new Error("W5 needs the scripted session's Enable agent access control")
        await audit.client.call("ax_desktop_click", { ref: enable.ref })
        await audit.wait(
          `Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Pause agent' && !b.disabled)`,
          "agent enrollment",
        )
        const nativeState = () =>
          session.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', { action: 'list' })`)
        const enrolledView = (await nativeState()).views.find((view) => view.sessionID === scenario.session.id)
        if (!enrolledView?.enabled) throw new Error("W5 provider was not enrolled")
        await session.send("Page.bringToFront")
        const press = async (key, code, windowsVirtualKeyCode) => {
          for (const type of ["keyDown", "keyUp"])
            await session.send("Input.dispatchKeyEvent", {
              type,
              key,
              code,
              windowsVirtualKeyCode,
              ...(type === "keyDown" && key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
            })
        }
        // Begin at the address input, then tab through the real toolbar to the primary action.
        await session.evaluate(`document.querySelector('input[aria-label="Project browser address"]').focus()`)
        for (let step = 0; step < 8; step += 1) {
          if (await session.evaluate(`document.activeElement?.textContent.trim() === 'Pause agent'`)) break
          await press("Tab", "Tab", 9)
        }
        await audit.wait(`document.activeElement?.textContent.trim() === 'Pause agent'`, "keyboard Pause focus")
        await press("Enter", "Enter", 13)
        await audit.wait(
          `document.activeElement?.textContent.trim() === 'Resume agent' && !document.activeElement.disabled`,
          "pause acknowledged and Resume focused",
        )
        await audit.wait(
          `document.body.textContent.includes("You have control of the page. The agent's calls wait until you resume.")`,
          "takeover explanation",
        )
        const pausedView = (await nativeState()).views.find((view) => view.id === enrolledView.id)
        if (!pausedView?.paused || !pausedView.visible || pausedView.generation !== enrolledView.generation)
          throw new Error("W5 did not keep the same visible page while paused")
        await capture("w5-paused")
        await press("Enter", "Enter", 13)
        await audit.wait(
          `document.activeElement?.textContent.trim() === 'Pause agent' && !document.activeElement.disabled`,
          "resume acknowledged and Pause focused",
        )
        await audit.click(`Page tools (${EXPECTED_TOOLS.length})`, { role: "button" })
        await audit.wait(`Boolean(${tool})`, "retained tool panel")
        await session.evaluate(
          `(() => { const button = ${tool}.querySelector('button[aria-expanded]'); if (button?.getAttribute('aria-expanded') === 'false') button.click() })()`,
        )
        await audit.wait(`Boolean(${tool}.querySelector('[data-webmcp-tool-result]'))`, "retained manual result")
        const retained = await session.evaluate(`${tool}.querySelector('[data-webmcp-tool-result]')?.textContent ?? ''`)
        if (!retained.includes("Ship the beta")) throw new Error("W5 lost the manual result during takeover")
        if (
          (await session.evaluate(`document.querySelector('input[aria-label="Project browser address"]').value`)) !==
          pageUrl
        )
          throw new Error("W5 changed the loaded address")
        const resumedView = (await nativeState()).views.find((view) => view.id === enrolledView.id)
        if (!resumedView?.enabled || resumedView.paused || resumedView.generation !== enrolledView.generation)
          throw new Error("W5 did not resume the same page")
        await capture("w5-resumed")
        if (args.artifacts)
          await fs.writeFile(
            path.join(args.artifacts, "w5-native-views.json"),
            JSON.stringify({ enrolledView, pausedView, resumedView }, null, 2),
          )
        const w7 = await checkBrowserSessions({
          session,
          debuggingPort,
          e2e,
          audit,
          pageUrl,
          secondUrl,
          artifacts: args.artifacts,
        })
        return {
          name: "project-browser",
          ok: true,
          detail: `W1 discovered ${names.length} page tools in ${w1Actions} actions; W2 ran add_task by hand (page error "${rejected.outcome}", then success "${added.outcome}") in ${w2Actions} actions; W5 idle takeover paused and resumed by keyboard with page/address/result retained; ${w7}`,
        }
      },
    ],
  })
} finally {
  server.close()
  secondServer.close()
}
for (const line of outcome?.lines ?? []) console.log(line)
process.exitCode = outcome?.ok ? 0 : 1
