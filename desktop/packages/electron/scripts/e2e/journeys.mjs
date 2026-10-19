import { parseCspDirectiveSources } from "./csp.mjs"
import { waitForCondition } from "./cdp.mjs"

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

export const JOURNEYS = [journeyBoot, journeyPreloadBridge, journeyCspClean, journeySettings]
