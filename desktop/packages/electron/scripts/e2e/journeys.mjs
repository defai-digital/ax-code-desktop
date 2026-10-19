import { parseCspDirectiveSources } from "./csp.mjs"
import { CdpSession, listTargets, waitForCondition, waitForTarget } from "./cdp.mjs"

// Installed before every document load: records CSP violations from the very
// first inline script onward, which a listener attached after load would miss.
export const CSP_RECORDER_SCRIPT = `(() => {
  const violations = []
  Object.defineProperty(window, "__axE2eCspViolations", { value: violations, configurable: true })
  document.addEventListener("securitypolicyviolation", (event) => {
    violations.push({
      directive: event.effectiveDirective || event.violatedDirective,
      blockedURI: event.blockedURI,
      sample: event.sample,
      source: event.sourceFile ? event.sourceFile + ":" + event.lineNumber : "",
    })
  })
})()`

export const SHELL_READY_EXPRESSION = `(() => {
  const root = document.getElementById("root")
  if (!root) return false
  return Array.from(root.children).some((child) => child.id !== "initial-loading")
})()`

export const BRIDGE_EXPRESSION = `({
  bridge: typeof window.__AX_CODE_DESKTOP_ELECTRON__ === "object" && window.__AX_CODE_DESKTOP_ELECTRON__ !== null,
  bootOutcome: typeof window.__AX_CODE_DESKTOP_DESKTOP_BOOT_OUTCOME__ !== "undefined",
  require: typeof require,
  nodeVersion: typeof process === "object" && process && process.versions ? String(process.versions.node || "") : "",
})`

export const isCspConsoleMessage = (text) => /Content Security Policy/i.test(String(text || ""))

/** Script sources that a renderer document must never allow (ADR-018). */
export const findForbiddenScriptSources = (csp, { packaged }) => {
  const scriptSrc = parseCspDirectiveSources(csp, "script-src")
  const forbidden = ["'unsafe-eval'", ...(packaged ? ["'unsafe-inline'"] : [])]
  return forbidden.filter((source) => scriptSrc.includes(source))
}

export const journeyBoot = async ({ session }) => {
  await waitForCondition(() => session.evaluate(SHELL_READY_EXPRESSION), { timeoutMs: 45_000, label: "app shell" })
  const title = await session.evaluate("document.title")
  return { name: "boot", ok: true, detail: `shell rendered (title: ${title || "untitled"})` }
}

export const journeyPreloadBridge = async ({ session }) => {
  const state = await session.evaluate(BRIDGE_EXPRESSION)
  const ok = state.bridge && state.bootOutcome && state.require === "undefined" && state.nodeVersion === ""
  return { name: "preload-bridge", ok, detail: JSON.stringify(state) }
}

export const journeyCspClean = async ({ session, documentCsp, consoleMessages, packaged }) => {
  const problems = []
  if (!documentCsp) problems.push("main document has no Content-Security-Policy header")
  for (const source of findForbiddenScriptSources(documentCsp, { packaged })) {
    problems.push(`script-src allows ${source}`)
  }
  const violations = (await session.evaluate("window.__axE2eCspViolations || []")) ?? []
  for (const violation of violations) problems.push(`violation: ${JSON.stringify(violation)}`)
  for (const message of consoleMessages.filter((entry) => isCspConsoleMessage(entry.text))) {
    problems.push(`console: ${message.text}`)
  }
  return {
    name: "csp-clean",
    ok: problems.length === 0,
    detail: problems.length === 0 ? `policy: ${documentCsp}` : problems.join("; "),
  }
}

export const journeySettings = async ({ session, platform = process.platform }) => {
  // CDP modifier bits: Alt=1, Ctrl=2, Meta=4, Shift=8. `mod` is Meta on macOS.
  const modifiers = platform === "darwin" ? 4 : 2
  for (const type of ["rawKeyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", {
      type,
      modifiers,
      key: ",",
      code: "Comma",
      windowsVirtualKeyCode: 188,
    })
  }
  await waitForCondition(() => session.evaluate('document.querySelector("[data-settings-view]") !== null'), {
    timeoutMs: 10_000,
    label: "settings view",
  })
  return { name: "settings", ok: true, detail: "settings view opened with the keyboard shortcut" }
}

export const isSupervisionPageTarget = (target) =>
  target?.type === "page" && typeof target.url === "string" && target.url.includes("/supervision.html")

export const OPEN_SUPERVISION_WINDOW_EXPRESSION = `window.__AX_CODE_DESKTOP__.invoke("desktop_open_supervision_window", {})`

export const SUPERVISION_BOARD_EXPRESSION = `document.querySelector('[data-mission-control="popout"]') !== null`

// SPEC-2026-10-19-supervision-popout-v1: the command opens one pop-out whose
// page renders the Mission Control board; asking again focuses that window.
export const journeySupervisionPopout = async ({ session, debuggingPort }) => {
  await session.evaluate(OPEN_SUPERVISION_WINDOW_EXPRESSION)
  const target = await waitForTarget(debuggingPort, isSupervisionPageTarget, { timeoutMs: 20_000 })
  const popout = await CdpSession.connect(target.webSocketDebuggerUrl)
  try {
    await waitForCondition(() => popout.evaluate(SUPERVISION_BOARD_EXPRESSION), {
      timeoutMs: 30_000,
      label: "supervision board",
    })
    await session.evaluate(OPEN_SUPERVISION_WINDOW_EXPRESSION)
    const windows = (await listTargets(debuggingPort)).filter(isSupervisionPageTarget).length
    return {
      name: "supervision-popout",
      ok: windows === 1,
      detail: `board rendered at ${new URL(target.url).pathname}; supervision windows after a second open: ${windows}`,
    }
  } finally {
    popout.close()
  }
}

export const JOURNEYS = [journeyBoot, journeyPreloadBridge, journeyCspClean, journeySettings, journeySupervisionPopout]
