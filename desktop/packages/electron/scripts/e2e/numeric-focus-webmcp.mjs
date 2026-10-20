#!/usr/bin/env node
// Compare real numeric focus events in foreground/background isolated windows.
import fs from "node:fs/promises"
import path from "node:path"
import { CdpSession, waitForCondition, waitForTarget } from "./cdp.mjs"
import { journeyBoot, isSupervisionPageTarget, OPEN_SUPERVISION_WINDOW_EXPRESSION } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true,
  journeys: [journeyBoot, async function journeyNumericFocus({ session, debuggingPort }) {
    const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
    const reads = []
    const read = async (label) => {
      const ui = await audit.all()
      const state = await session.evaluate(`({focused: document.hasFocus(), active: document.activeElement?.getAttribute('aria-label'),
        topP: document.querySelector('[data-settings-view] [aria-label="Top P"]')?.value,
        temperature: document.querySelector('[data-settings-view] [aria-label="Temperature"]')?.value,
        trace: window.__axNumericFocusTrace?.events ?? []})`)
      reads.push({ label, documentFocused: ui.documentFocused, ...state })
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "numeric-focus-receipt.json"), JSON.stringify({ reads, actions: audit.calls }, null, 2))
      }
      if (ui.documentFocused !== state.focused) throw new Error("Native snapshot document focus disagrees with DOM observation")
      return state
    }
    const activateMain = async () => {
      const focused = await session.evaluate('window.__AX_CODE_DESKTOP__.invoke("desktop_focus_main_window", {})')
      if (!focused?.focused) throw new Error("Native main-window focus request failed")
      await audit.wait("document.hasFocus()", "native main window foreground")
    }
    await session.send("Page.bringToFront")
    await audit.wait("document.hasFocus()", "foreground before numeric setup")
    await audit.client.enable()
    await audit.click("Settings")
    await audit.page("Agents")
    await audit.click("New Agent")
    await audit.find("Top P", { role: "input" })
    // Observation only: no application handlers, field values or stores are changed here.
    await session.evaluate(`(() => {
      const trace = {phase: 'foreground', events: []}; window.__axNumericFocusTrace = trace;
      for (const type of ['focusin','focusout','focus','blur','input','change']) {
        document.addEventListener(type, event => {
          const target = event.target;
          const field = target?.getAttribute?.('aria-label');
          if (!['Top P','Temperature'].includes(field) || trace.events.length >= 200) return;
          trace.events.push({phase: trace.phase, type, field, focused: document.hasFocus(),
            active: document.activeElement?.getAttribute('aria-label'), related: event.relatedTarget?.getAttribute?.('aria-label'),
            value: target.value, trusted: event.isTrusted});
        }, true);
      }
      return true;
    })()`)
    await activateMain()
    if (!(await read("foreground immediately before numeric edit")).focused) throw new Error("Foreground prerequisite lost before numeric edit")
    await audit.fill("Top P", "2")
    if (!(await read("foreground out-of-range draft")).focused) throw new Error("Foreground prerequisite lost during numeric edit")
    await audit.click("Temperature", { role: "input" })
    try {
      await audit.wait(`document.querySelector('[data-settings-view] [aria-label="Top P"]')?.value === '1'`, "foreground maximum clamp")
    } catch (error) { await read("foreground clamp failure telemetry"); throw error }
    await read("foreground clamp after blur")
    await audit.click("Clear top p override")
    await session.evaluate(OPEN_SUPERVISION_WINDOW_EXPRESSION)
    const target = await waitForTarget(debuggingPort, isSupervisionPageTarget)
    const popout = await CdpSession.connect(target.webSocketDebuggerUrl)
    try {
      await popout.send("Page.enable")
      await popout.send("Page.bringToFront")
      await waitForCondition(() => popout.evaluate("document.hasFocus()"), { label: "isolated pop-out owns focus" })
      await audit.wait("!document.hasFocus()", "main window is inactive")
      await session.evaluate("window.__axNumericFocusTrace.phase = 'background'")
      await read("before background numeric actions")
      await audit.fill("Top P", "2")
      await read("after background fill")
      await audit.click("Temperature", { role: "input" })
      const background = await read("after background focus change")
      if (!["1", "2"].includes(background.topP)) throw new Error("Unexpected numeric read-back")
      await audit.capture("Background numeric controls")
      // Activate the native window; Page.bringToFront alone need not transfer focus between Electron windows.
      await activateMain()
      await session.evaluate("window.__axNumericFocusTrace.phase = 'refocused'")
      await audit.click("Top P", { role: "input" })
      await audit.click("Temperature", { role: "input" })
      await audit.wait(`document.querySelector('[data-settings-view] [aria-label="Top P"]')?.value === '1'`, "foreground restored maximum clamp")
      const restored = await read("foreground restored and blur delivered")
      if (!restored.trace.some(event => event.phase === "refocused" && event.field === "Top P" && event.type === "focusout" && event.focused)) {
        throw new Error("No actual foreground Top P focusout observed")
      }
      await audit.click("Clear top p override")
      if (!(await audit.find("Save Changes")).disabled) throw new Error("Diagnostic draft did not return to clean state")
      await audit.capture("Numeric controls restored")
      await read("clean diagnostic draft")
      return { name: "numeric-focus-webmcp", ok: true,
        detail: `Foreground clamp and observed focusout passed; background focused=${background.focused}, Top P=${background.topP}; restored foreground clamp and clean state passed; no save submitted` }
    } finally { popout.close() }
  }],
})
outcome.lines.forEach(line => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
