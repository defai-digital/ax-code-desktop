#!/usr/bin/env node
// Native task suite W3/W4/W6/W8. Fixture preparation and observations are not user actions.
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { CdpSession, listTargets, waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { assertPathInsideDirectory } from "./scenario.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..")
const args = parseArgs(process.argv.slice(2))
// Invoke pnpm's JS entry directly so Windows cmd.exe cannot rewrite JSON quotes.
const pnpmEntry = async () => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const candidate of [path.join(directory, "pnpm"),
      ...[directory, path.dirname(directory)].flatMap(base => [
        path.join(base, "node_modules/pnpm/bin/pnpm.cjs"),
        path.join(base, "node_modules/corepack/dist/pnpm.js"),
      ])]) {
      const resolved = await fs.realpath(candidate).catch(() => null)
      if (resolved && /\.(?:c?js|mjs)$/.test(resolved)) return resolved
    }
  }
  throw new Error("Cannot locate the installed pnpm JavaScript entry")
}

// Extend the actual documented example, retaining its registrations and visible UI.
const registration = (changed = false) => `document.modelContext.registerTool({
  name: 'builder_echo', description: 'Echo builder input for a regression test.',
  annotations: { consequentialHint: true },
  inputSchema: { type: 'object', properties: { text: { type: 'string' }${changed ? ", revision: { type: 'integer' }" : ""} }, required: ['text'] },
  execute: async input => input.text === 'fail' ? { error: { field: 'text', keyword: 'minLength', message: 'W6 controlled page failure' } } : input
})`
const fixture = (await fs.readFile(path.join(root, "docs/examples/webmcp-quickstart/index.html"), "utf8"))
  .replace("</body>", `<script type="module">
    window.addBuilderTool = async () => {
      window.builderRegistration = new AbortController();
      await ${registration().replace(/\}\)$/, "}, { signal: window.builderRegistration.signal })")};
    };
    if (new URLSearchParams(location.search).has('builder')) await window.addBuilderTool();
    window.changeBuilderTool = async () => {
      window.builderRegistration.abort();
      await ${registration(true)};
    };
    window.rejectBuilderTool = async () => {
      try { await document.modelContext.registerTool({ name: 'invalid_builder', description: 'x'.repeat(4097),
        inputSchema: { type: 'object' }, execute: async () => ({}) }); } catch (error) { window.builderRejection = String(error); }
    };
  </script></body>`)
const server = http.createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(fixture)
})
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
const pageUrl = `http://127.0.0.1:${server.address().port}/`
let outcome
try {
  outcome = await runHarness({ ...args, uiWebMcp: true, portfolio: true, journeys: [journeyBoot,
    async function journeyTasks({ session, debuggingPort, e2e }) {
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const owner = e2e.scenario.session
      // Review landing requires a repository; the shared harness deliberately seeds git-less projects.
      assertPathInsideDirectory(owner.directory, path.dirname(e2e.stubOriginPath), "Fixture repository")
      await promisify(execFile)("git", ["init", "--quiet", owner.directory])
      await audit.wait(`Boolean(document.querySelector('[data-session-row="${owner.id}"]'))`, "session row")
      await session.evaluate(`Array.from(document.querySelector('[data-session-row="${owner.id}"]').querySelectorAll('button')).find(b => b.textContent.trim().startsWith(${JSON.stringify(owner.title)})).click()`)
      await audit.wait(`Boolean(document.querySelector('[aria-label="Copy session ID ${owner.id}"]'))`, "selected session")
      const ipc = (body) => session.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', ${JSON.stringify(body)})`)
      const view = async () => (await ipc({ action: "list" })).views.find((item) => item.sessionID === owner.id)
      const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
      const reviewArmed = await fetch(`${origin}/__e2e__/step`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "review-scopes" }),
      })
      if (!reviewArmed.ok) throw new Error("Could not arm session review fixture")
      const runtime = async (body) => {
        const response = await fetch(`${origin}/__e2e__/browser-task`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionID: owner.id, ...body }) })
        if (!response.ok) throw new Error(`Task fixture failed: ${response.status}`)
        return response.json()
      }
      const completed = async (id) => waitForCondition(async () => {
        const response = await fetch(`${origin}/__e2e__/browser-test`)
        const report = await response.json()
        return report.replies.some(reply => reply.requestID === id && reply.status === "Completed")
      }, { label: `Native call ${id} completed` })
      const counts = { W3: 0, W4: 0, W6: 0, W8: 0 }
      const budgets = { W3: 12, W4: 10, W6: 8, W8: 15 }
      const act = async (task, run) => { counts[task]++; return run() }
      const click = (task, selector) => act(task, () => session.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`))
      const wait = (expression, label) => audit.wait(expression, label)
      const capture = async (task, extra = {}) => {
        if (counts[task] > budgets[task]) throw new Error(`${task}: ${counts[task]}/${budgets[task]} actions`)
        console.log(`${task}: ${counts[task]}/${budgets[task]} actions`)
        if (!args.artifacts) return
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, `${task.toLowerCase()}.json`), JSON.stringify({ actions: counts[task], budget: budgets[task], state: await audit.all(), text: await session.evaluate("document.body.innerText"), ...extra }, null, 2))
        const shot = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${task.toLowerCase()}.png`), Buffer.from(shot.data, "base64"))
      }
      // W8 owns opening the documented quickstart and adding a registration.
      const header = (await audit.all()).controls.find((control) => control.name.startsWith("Project browser (WebMCP):"))
      if (!header) throw new Error("Missing project browser header")
      await act("W8", () => audit.client.call("ax_desktop_click", { ref: header.ref }))
      await act("W8", () => audit.click("Project browser (WebMCP)", { role: "tab" }))
      await act("W8", () => audit.fill("Project browser address", pageUrl))
      await wait(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Go' && !b.disabled)`, "browser ready")
      await act("W8", () => audit.click("Go", { role: "button" }))
      await wait(`document.querySelector('[data-webmcp-tool-panel]')?.textContent.includes('Page tools (4)')`, "quickstart catalog")
      const target = (await listTargets(debuggingPort)).find((item) => item.url === pageUrl)
      if (!target) throw new Error("Missing native quickstart guest")
      const guest = await CdpSession.connect(target.webSocketDebuggerUrl)
      try {
        await act("W8", () => guest.evaluate("window.addBuilderTool()"))
        await wait(`document.querySelector('[data-webmcp-tool-panel]')?.textContent.includes('Page tools (5)')`, "new registration")
        await act("W8", () => audit.click("Page tools (5)", { role: "button" }))
        const tool = '[data-webmcp-tool="builder_echo"]'
        await click("W8", `${tool} button[aria-expanded]`)
        const fill = async (task, value) => act(task, () => session.evaluate(`(() => {
          const tool = document.querySelector(${JSON.stringify(tool)});
          const label = Array.from(tool.querySelectorAll('label[for]')).find(l => l.textContent.trim().startsWith('text'));
          const input = document.getElementById(label.htmlFor);
          Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`))
        const tryTool = async (task) => {
          const before = await session.evaluate("document.querySelectorAll('[data-webmcp-journal-entry]').length")
          await act(task, () => session.evaluate(`Array.from(document.querySelector(${JSON.stringify(tool)}).querySelectorAll('button')).find(b => b.textContent.trim() === 'Try it').click()`))
          await wait(`document.querySelectorAll('[data-webmcp-journal-entry]').length > ${before}`, "manual journal result")
        }
        await fill("W8", "builder regression")
        await tryTool("W8")
        await click("W8", "[data-webmcp-replay]")
        await tryTool("W8")
        const snippet = await session.evaluate(`document.querySelector('[data-webmcp-export="manual"] [data-webmcp-export-snippet]')?.textContent`)
        if (!snippet?.includes("builder_echo") || !snippet.includes("builder regression")) throw new Error("W8 missing executable regression export")
        await act("W8", () => session.evaluate(`Array.from(document.querySelector('[data-webmcp-export="manual"]').querySelectorAll('button')).find(b => b.textContent.includes('Copy test')).click()`))
        // The same served quickstart registers the added tool in the independent checker process.
        const checkerUrl = `${pageUrl}?builder=1`
        const pnpm = await pnpmEntry()
        const checked = await act("W8", () => new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [pnpm, "run", "webmcp:check", "--", "--url", checkerUrl, "--expect-tools", "builder_echo", "--run", 'builder_echo={"text":"builder regression"}', "--json"], { cwd: root })
          let stdout = "", stderr = ""
          child.stdout.on("data", (data) => { stdout += data })
          child.stderr.on("data", (data) => { stderr += data })
          child.on("error", reject)
          child.on("close", (code) => resolve({ code, stdout, stderr }))
        }))
        if (args.artifacts) { await fs.mkdir(args.artifacts, { recursive: true }); await fs.writeFile(path.join(args.artifacts, "w8-test.mjs"), snippet); await fs.writeFile(path.join(args.artifacts, "w8-checker.json"), JSON.stringify(checked, null, 2)) }
        if (checked.code !== 0) throw new Error(`W8 checker exit ${checked.code}: ${checked.stderr}`)
        await capture("W8", { snippet, checked })

        await act("W3", () => guest.evaluate("window.changeBuilderTool()"))
        await wait(`Array.from(document.querySelectorAll('[data-webmcp-registration-kind="changed"]')).some(row => row.textContent.includes('builder_echo'))`, "schema history diff")
        // A schema change collapses its form; opening it is a user action.
        if (await session.evaluate(`document.querySelector('${tool} button[aria-expanded]')?.getAttribute('aria-expanded') === 'false'`)) await click("W3", `${tool} button[aria-expanded]`)
        await wait(`Boolean(document.querySelector('[data-webmcp-stale="true"]'))`, "stale manual result")
        await capture("W3", { phase: "changed" })
        await act("W3", () => guest.evaluate("window.rejectBuilderTool()"))
        await wait(`Boolean(document.querySelector('[data-webmcp-catalog-rejection-tool="invalid_builder"]')) && Boolean(document.querySelector('[data-webmcp-tool-panel]')) && Boolean(document.querySelector('${tool}'))`, "named rejection preserves panel")
        await capture("W3", { phase: "rejected" })

        // The inspector covers the native guest. Restore the visible page before enrollment.
        await act("W4", () => audit.click("Page tools (5)", { role: "button" }))
        await act("W4", () => audit.click("Enable agent access", { role: "button" }))
        await waitForCondition(async () => (await view())?.enabled, { label: "provider enrolled" })
        const run = async (id, text, options = {}) => {
          const definition = (await view()).catalog.find((item) => item.name === "builder_echo")
          return runtime({ requestID: id, toolName: definition.name, digest: definition.definitionDigest, input: { text }, ...options })
        }
        await run("w4-approved", "approved once", { approval: true })
        await wait(`Boolean(document.querySelector('[data-webmcp-effect]')) && document.querySelector('[data-webmcp-approval-description]')?.textContent.includes('Echo builder input') && document.body.textContent.includes(${JSON.stringify(new URL(pageUrl).origin)})`, "approval origin effect and page definition")
        await capture("W4", { phase: "approval" })
        await act("W4", () => audit.click("Allow once", { role: "button" }))
        await completed("w4-approved")
        await wait(`Array.from(document.querySelectorAll('[data-webmcp-call="ok"]')).some(row => row.querySelector('[data-webmcp-call-arguments]')?.textContent.includes('approved once') && Boolean(row.querySelector('[data-webmcp-call-definition]')))`, "approved native call completed")
        await run("w4-expired", "never executed", { approval: true, expireMs: 2500 })
        await wait(`Boolean(document.querySelector('[data-webmcp-effect]'))`, "second approval unanswered")
        await wait(`document.body.textContent.includes('Scripted approval expired without an answer')`, "explicit scripted expiry")
        await capture("W4", { limitation: "Expiry is driven by the scripted stub, not the signed runtime's approval timer." })

        // Start a fresh turn so the landing recap contains precisely three calls.
        await runtime({ requestID: "w6-first", toolName: "list_tasks", digest: (await view()).catalog.find(t => t.name === "list_tasks").definitionDigest, input: {}, newTurn: true })
        await completed("w6-first")
        await run("w6-failure", "fail")
        await completed("w6-failure")
        await wait(`document.body.textContent.includes('W6 controlled page failure')`, "failed call")
        await run("w6-last", "three calls complete")
        await completed("w6-last")
        await wait(`document.body.textContent.includes('three calls complete')`, "third call")
        await click("W6", '[data-webmcp-call="failed"] button')
        await wait(`Boolean(document.querySelector('[data-tool-part-id="part_w6-failure"][data-attention]'))`, "strip opens exact transcript tool part")
        await act("W6", () => audit.click("Review changes", { role: "button" }))
        await wait(`Boolean(document.querySelector('[data-review-scope]'))`, "review scopes")
        await act("W6", () => audit.click("This session", { role: "radio" }))
        await wait(`document.querySelectorAll('[data-recap-outcome]').length === 3 && document.querySelector('[data-landing-browser-recap]')?.textContent.includes('W6 controlled page failure') && document.querySelector('[data-recap-not-called]')?.textContent.includes('complete_task')`, "three-call landing recap with failure and unused tool")
        await click("W6", "[data-landing-browser-recap] summary")
        await wait(`Boolean(document.querySelector('[data-recap-outcome="failed"] [data-webmcp-rejection-property="text"][data-webmcp-rejection-rule="minLength"]'))`, "runtime property rejection in recap")
        await act("W6", () => session.evaluate(`document.querySelector('[data-recap-outcome="failed"] [data-webmcp-runtime-rejections]').scrollIntoView({ block: 'center' })`))
        await capture("W6")
        // Identity regression, separate from the W3/W4/W6/W8 action budgets above.
        // Fixture preparation uses real native registrations; the agent call still goes through the runtime bridge.
        await audit.click("Project browser (WebMCP)", { role: "tab" })
        const credentialNames = ["ghp_abcdefghijklmnop", "ghp_qrstuvwxyzabcdef"]
        await guest.evaluate(`(() => {
          window.credentialRegistrations = [new AbortController(), new AbortController()];
          ${JSON.stringify(credentialNames)}.forEach((name, index) => document.modelContext.registerTool({
            name, description: 'Credential identity fixture ' + (index + 1),
            inputSchema: { type: 'object', properties: { value: { type: index ? 'number' : 'string' } } },
            execute: async input => ({ echoed: input.value })
          }, { signal: window.credentialRegistrations[index].signal }));
        })()`)
        await waitForCondition(async () => (await view()).catalog.length === 7, { label: "two credential tool bindings" })
        await wait(`document.querySelector('[data-webmcp-tool-panel] > button')?.textContent.includes('Page tools (7)')`,
          "renderer observed the original credential catalog")
        const originalCredentialTools = (await view()).catalog.filter(item => item.name.startsWith("[redacted tool "))
        if (originalCredentialTools.length !== 2 || originalCredentialTools[0].invocationID === originalCredentialTools[1].invocationID)
          throw new Error("Credential tools lost distinct main identities")
        await runtime({ requestID: "credential-first", toolName: credentialNames[0],
          digest: originalCredentialTools[0].definitionDigest, input: { value: "credential fixture result" }, newTurn: true })
        await completed("credential-first")
        await guest.evaluate(`(() => {
          window.credentialRegistrations[1].abort();
          document.modelContext.registerTool({
            name: ${JSON.stringify(credentialNames[1])}, description: 'Credential identity fixture 2',
            inputSchema: { type: 'object', properties: { value: { type: 'boolean' } }, required: ['value'] },
            execute: async input => ({ echoed: input.value })
          });
        })()`)
        await waitForCondition(async () => {
          const current = (await view()).catalog.find(item => item.invocationID === originalCredentialTools[1].invocationID)
          return current && current.definitionDigest !== originalCredentialTools[1].definitionDigest
        }, { label: "credential schema version changed on the same tool ID" })
        await wait(`document.querySelectorAll('[data-recap-outcome]').length === 1 &&
          document.querySelector('[data-recap-open]')?.textContent.includes('[redacted tool 1]') &&
          document.querySelector('[data-recap-not-called]')?.textContent.includes('[redacted tool 2]') &&
          !document.querySelector('[data-recap-not-called]')?.textContent.includes('[redacted tool 1]')`, "credential recap attribution")
        await wait(`Array.from(document.querySelectorAll('[data-webmcp-call="ok"]')).some(row => row.textContent.includes('[redacted tool 1]'))`, "credential call strip label")
        await audit.click("Page tools (7)", { role: "button" })
        await wait(`Array.from(document.querySelectorAll('[data-webmcp-registration-kind="changed"]')).some(row =>
          row.textContent.includes('[redacted tool 2]') && row.textContent.includes('boolean') && row.textContent.includes('required'))`, "credential property diff")
        await session.evaluate(`document.querySelector('[data-webmcp-tool="[redacted tool 1]"] button[aria-expanded]').click()`)
        await wait(`Boolean(document.querySelector('[data-webmcp-tool="[redacted tool 1]"] [data-webmcp-compare-agent]')) &&
          !document.querySelector('[data-webmcp-tool="[redacted tool 2]"] [data-webmcp-compare-agent]')`, "credential comparison binding")
        const credentialEvidence = await session.evaluate(`({
          recap: document.querySelector('[data-landing-browser-recap]')?.innerText,
          panel: document.querySelector('[data-webmcp-tool-panel]')?.innerText,
          strip: document.querySelector('[data-webmcp-call-strip]')?.innerText
        })`)
        if (credentialNames.some(name => JSON.stringify(credentialEvidence).includes(name)))
          throw new Error("Credential name leaked into displayed evidence")
        if (args.artifacts) {
          await fs.writeFile(path.join(args.artifacts, "credential-identities.json"), JSON.stringify(credentialEvidence, null, 2))
          const shot = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, "credential-identities.png"), Buffer.from(shot.data, "base64"))
        }
        return { name: "project-browser-tasks", ok: true, detail: `${Object.keys(counts).map(task => `${task} ${counts[task]}/${budgets[task]} actions`).join('; ')}; W4 expiry driven by scripted stub, signed runtime timer not qualified` }
      } finally { guest.close() }
    },
  ] })
} finally { server.close() }
for (const line of outcome?.lines ?? []) console.log(line)
process.exitCode = outcome?.ok ? 0 : 1
