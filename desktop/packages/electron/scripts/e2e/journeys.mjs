import fs from "node:fs/promises"
import { parseCspDirectiveSources } from "./csp.mjs"
import { CdpSession, listTargets, waitForCondition, waitForTarget } from "./cdp.mjs"
import { E2E_STEP_ROUTE, findReplyAttemptProblems, parseReplyLog } from "./scenario.mjs"

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
    // The host retains this across reloads, so navigation cannot erase a failure.
    window.__axE2eReportCsp?.(JSON.stringify(violations[violations.length - 1]))
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

/**
 * Same-origin health probe the renderer itself can make: the app server
 * proxies `/api/global/health` to the runtime's `/global/health`, which the
 * supervisor also requires to answer 200 with `healthy: true`.
 */
export const RUNTIME_HEALTH_EXPRESSION = `(async () => {
  try {
    const response = await fetch("/api/global/health")
    if (response.status !== 200) return false
    const body = await response.json().catch(() => null)
    return Boolean(body && body.healthy === true)
  } catch {
    return false
  }
})()`

export const seededSessionKnownExpression = (scenario) => `(() => {
  const sessionId = ${JSON.stringify(scenario?.session?.id ?? "")}
  const title = ${JSON.stringify(scenario?.session?.title ?? "")}
  if (document.getElementById("mission-row-" + sessionId)) return true
  if (document.querySelector('[data-session-id="' + sessionId + '"]')) return true
  const text = document.body ? (document.body.innerText || "") + (document.body.textContent || "") : ""
  return Boolean(title && text.includes(title))
})()`

const readinessStage = async (stage, run) => {
  try {
    return await run()
  } catch (error) {
    throw new Error(`Runtime readiness failed at stage "${stage}": ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Barrier before the scenario journeys: the stub origin file exists, the app
 * reports the runtime healthy through its own server, the main page reloads
 * once against that live runtime, and the seeded session is known to the
 * renderer. A timeout names the stage that never completed.
 */
export const waitForRuntimeReadiness = async ({
  session,
  stubOriginPath,
  scenario,
  timeoutMs = 60_000,
  readFile = fs.readFile,
}) => {
  await readinessStage("stub-origin", () =>
    waitForCondition(
      async () => {
        try {
          return (await readFile(stubOriginPath, "utf8")).trim() || false
        } catch {
          return false
        }
      },
      { timeoutMs, label: "stub runtime origin file" },
    ),
  )
  await readinessStage("runtime-health", () =>
    waitForCondition(() => session.evaluate(RUNTIME_HEALTH_EXPRESSION), {
      timeoutMs,
      label: "runtime health through the app server",
    }),
  )
  await readinessStage("runtime-reload", async () => {
    await session.send("Page.reload", { ignoreCache: true })
    return true
  })
  await readinessStage("seeded-session", () =>
    waitForCondition(() => session.evaluate(seededSessionKnownExpression(scenario)), {
      timeoutMs,
      label: "seeded session known to the renderer",
    }),
  )
  return true
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

export const journeyCspClean = async ({
  session,
  documentCsp,
  consoleMessages,
  packaged,
  cspViolations = [],
  popoutDocumentCsps = [],
}) => {
  const problems = []
  if (!documentCsp) problems.push("main document has no Content-Security-Policy header")
  for (const source of findForbiddenScriptSources(documentCsp, { packaged })) {
    problems.push(`script-src allows ${source}`)
  }
  for (const popoutCsp of popoutDocumentCsps) {
    if (!popoutCsp) {
      problems.push("supervision pop-out document has no Content-Security-Policy header")
      continue
    }
    for (const source of findForbiddenScriptSources(popoutCsp, { packaged })) {
      problems.push(`supervision pop-out script-src allows ${source}`)
    }
  }
  const violations = (await session.evaluate("window.__axE2eCspViolations || []")) ?? []
  const seen = new Set()
  for (const violation of violations) {
    const text = `violation: ${JSON.stringify(violation)}`
    if (!seen.has(text)) problems.push(text)
    seen.add(text)
  }
  // Host-retained binding reports survive page reloads and pop-out closes.
  for (const payload of cspViolations) {
    const text = `violation: ${String(payload)}`
    if (!seen.has(text)) problems.push(text)
    seen.add(text)
  }
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
  // A pop-out can own focus after the preceding journey. Keyboard delivery
  // requires the tested document to be active, as it would be for a user.
  await session.send("Page.bringToFront")
  await waitForCondition(() => session.evaluate("document.hasFocus()"), {
    timeoutMs: 10_000,
    label: "main window focus",
  })
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

const documentHeaderValue = (headers, name) => {
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === name)
  return key ? String(headers[key]) : ""
}

/**
 * The same CSP recorder, binding and Log/Network collection the main page
 * gets, installed on the supervision pop-out. Violations and messages are
 * retained in the caller's arrays, so closing the pop-out (or its document
 * reloading) cannot erase them before the final checks.
 */
const instrumentSupervisionPopout = async (popout, { target, consoleMessages, cspViolations, popoutDocumentCsps }) => {
  if (consoleMessages) {
    popout.on("Runtime.consoleAPICalled", (params) => {
      const text = (params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ")
      consoleMessages.push({ source: "console", level: params.type, page: target.url, text })
    })
    popout.on("Runtime.exceptionThrown", ({ exceptionDetails = {} }) => {
      consoleMessages.push({
        source: "exception",
        level: "error",
        page: target.url,
        text: exceptionDetails.exception?.description || exceptionDetails.text,
      })
    })
    popout.on("Log.entryAdded", (params) => {
      const entry = params.entry || {}
      consoleMessages.push({ source: entry.source || "log", level: entry.level, page: target.url, text: entry.text })
    })
  }
  if (cspViolations) {
    popout.on("Runtime.bindingCalled", (params) => {
      if (params.name === "__axE2eReportCsp") cspViolations.push(params.payload)
    })
  }
  if (popoutDocumentCsps) {
    popout.on("Network.responseReceived", (params) => {
      if (params.type === "Document") {
        popoutDocumentCsps.push(documentHeaderValue(params.response?.headers, "content-security-policy"))
      }
    })
  }
  await Promise.all([
    popout.send("Runtime.enable"),
    popout.send("Log.enable"),
    popout.send("Network.enable"),
    popout.send("Page.enable"),
  ])
  await popout.send("Runtime.addBinding", { name: "__axE2eReportCsp" })
  await popout.send("Page.addScriptToEvaluateOnNewDocument", { source: CSP_RECORDER_SCRIPT })
  // Reload so the recorder sees the pop-out document from its first script.
  await popout.send("Page.reload", { ignoreCache: true })
}

const openSupervisionBoard = async ({ session, debuggingPort, consoleMessages, cspViolations, popoutDocumentCsps }) => {
  await session.evaluate(OPEN_SUPERVISION_WINDOW_EXPRESSION)
  const target = await waitForTarget(debuggingPort, isSupervisionPageTarget, { timeoutMs: 20_000 })
  const popout = await CdpSession.connect(target.webSocketDebuggerUrl)
  await instrumentSupervisionPopout(popout, { target, consoleMessages, cspViolations, popoutDocumentCsps })
  await waitForCondition(() => popout.evaluate(SUPERVISION_BOARD_EXPRESSION), {
    timeoutMs: 30_000,
    label: "supervision board",
  })
  return popout
}

// SPEC-2026-10-19-supervision-popout-v1: the command opens one pop-out whose
// page renders the Mission Control board; asking again focuses that window.
export const journeySupervisionPopout = async ({
  session,
  debuggingPort,
  consoleMessages = [],
  cspViolations,
  popoutDocumentCsps,
}) => {
  const popout = await openSupervisionBoard({ session, debuggingPort, consoleMessages, cspViolations, popoutDocumentCsps })
  try {
    await session.evaluate(OPEN_SUPERVISION_WINDOW_EXPRESSION)
    const targets = await listTargets(debuggingPort)
    const windows = targets.filter(isSupervisionPageTarget).length
    const target = targets.find(isSupervisionPageTarget)
    return {
      name: "supervision-popout",
      ok: windows === 1,
      detail: `board rendered at ${target ? new URL(target.url).pathname : "unknown"}; supervision windows after a second open: ${windows}`,
    }
  } finally {
    popout.close()
  }
}

export const journeyRendererErrors = async ({ consoleMessages }) => {
  const errors = consoleMessages.filter((message) => message.source === "exception")
  return {
    name: "renderer-errors",
    ok: errors.length === 0,
    detail: errors.length ? errors.map((message) => message.text).join("; ") : "no uncaught renderer exceptions",
  }
}

// A successful initial mount does not prove that a persisted profile can boot
// again. Verify a new document and the sandbox bridge after user interaction.
export const journeyReload = async ({ session }) => {
  const before = await session.evaluate("performance.timeOrigin")
  await session.send("Page.reload", { ignoreCache: true })
  await waitForCondition(
    () => session.evaluate(`performance.timeOrigin !== ${Number(before)} && (${SHELL_READY_EXPRESSION})`),
    { timeoutMs: 45_000, label: "shell after reload" },
  )
  const bridge = await journeyPreloadBridge({ session })
  if (!bridge.ok) throw new Error(`Preload bridge lost after reload: ${bridge.detail}`)
  await journeySettings({ session })
  return { name: "reload", ok: true, detail: "new document rendered, sandbox bridge survived, settings reopened" }
}

const rowId = (sessionId) => `mission-row-${sessionId}`

export const missionRowStateExpression = (sessionId) => `(() => {
  const row = document.getElementById(${JSON.stringify(rowId(sessionId))})
  if (!row) return ""
  const badge = row.querySelector("[data-supervision-state]")
  return badge ? badge.getAttribute("data-supervision-state") || "" : ""
})()`

const missionRowTextExpression = (sessionId) => `(() => {
  const row = document.getElementById(${JSON.stringify(rowId(sessionId))})
  return row ? row.textContent || "" : ""
})()`

const missionRowHtmlExpression = (sessionId) => `(() => {
  const row = document.getElementById(${JSON.stringify(rowId(sessionId))})
  return row ? row.outerHTML || "" : ""
})()`

const goalLineTextExpression = (sessionId) => `(() => {
  const row = document.getElementById(${JSON.stringify(rowId(sessionId))})
  if (!row) return ""
  const line = row.querySelector("[data-goal-line]")
  return line ? line.textContent || "" : ""
})()`

const reviewRequestClickExpression = (sessionId) => `(() => {
  const row = document.getElementById(${JSON.stringify(rowId(sessionId))})
  if (!row) return false
  const button = Array.from(row.querySelectorAll("button")).find((entry) =>
    (entry.getAttribute("aria-label") || "").startsWith("Review request"),
  )
  if (!button) return false
  button.click()
  return true
})()`

const requestCardPresentExpression = (pattern) =>
  `Array.from(document.querySelectorAll('[data-request-kind="permission"]')).some((entry) => (entry.textContent || "").includes(${JSON.stringify(pattern)}))`

const requestCardButtonClickExpression = (pattern, label) => `(() => {
  const cards = Array.from(document.querySelectorAll('[data-request-kind="permission"]'))
  const card = cards.find((entry) => (entry.textContent || "").includes(${JSON.stringify(pattern)}))
  if (!card) return false
  const button = Array.from(card.querySelectorAll("button")).find(
    (entry) => (entry.textContent || "").trim() === ${JSON.stringify(label)},
  )
  if (!button || button.disabled) return false
  button.click()
  return true
})()`

const requestClearedExpression = (sessionId, pattern) => `(() => {
  if (${requestCardPresentExpression(pattern)}) return false
  const row = document.getElementById(${JSON.stringify(rowId(sessionId))})
  if (!row) return true
  const badge = row.querySelector("[data-supervision-state]")
  return !badge || badge.getAttribute("data-supervision-state") !== "permission"
})()`

const NEEDS_YOU_BUTTON_EXPRESSION = `Array.from(document.querySelectorAll("button")).find((entry) => (entry.getAttribute("aria-label") || "").startsWith("Needs you"))`

const needsYouLabelExpression = `(() => {
  const button = ${NEEDS_YOU_BUTTON_EXPRESSION}
  return button ? button.getAttribute("aria-label") || "" : ""
})()`

export const needsYouWaitingCount = (label) => {
  const match = /(\d+) waiting/.exec(String(label || ""))
  return match ? Number.parseInt(match[1], 10) : 0
}

const readReplyRecords = async (e2e) => {
  try {
    return parseReplyLog(await fs.readFile(e2e.repliesPath, "utf8"))
  } catch {
    return []
  }
}

const postStubStep = async (e2e, step) => {
  const origin = await waitForCondition(
    async () => {
      try {
        return (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
      } catch {
        return ""
      }
    },
    { timeoutMs: 15_000, label: "stub runtime origin" },
  )
  const response = await fetch(`${origin}${E2E_STEP_ROUTE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Stub step "${step}" failed with status ${response.status}`)
}

const readNeedsYouPopoverText = async (session) => {
  const opened = await session.evaluate(`(() => {
    const button = ${NEEDS_YOU_BUTTON_EXPRESSION}
    if (!button) return false
    if (button.getAttribute("aria-expanded") !== "true") button.click()
    return true
  })()`)
  if (!opened) throw new Error("The main window shows no Needs you button")
  try {
    return await waitForCondition(
      () =>
        session.evaluate(`(() => {
          const dialog = document.querySelector('[role="dialog"]')
          return dialog ? dialog.textContent || "" : ""
        })()`),
      { timeoutMs: 15_000, label: "needs-you popover" },
    )
  } finally {
    await session
      .evaluate(
        `(() => {
        const button = ${NEEDS_YOU_BUTTON_EXPRESSION}
        if (button && button.getAttribute("aria-expanded") === "true") button.click()
        return true
      })()`,
      )
      .catch(() => {})
  }
}

const requireE2eContext = (e2e) => {
  if (!e2e?.scenario || !e2e.repliesPath || !e2e.stubOriginPath) {
    throw new Error("The scripted-session e2e context is missing from the launch")
  }
  return e2e.scenario
}

// One pending permission end to end (SPEC-2026-10-19-desktop-e2e-journeys-v1):
// the pop-out board shows the request, a click answers it, the stub records
// exactly one reply, and both windows stop showing the request.
const drivePermissionJourney = async (
  { session, debuggingPort, consoleMessages, cspViolations, popoutDocumentCsps, e2e },
  { armStep, request, pattern, buttonLabel, expectedReply, name },
) => {
  const scenario = requireE2eContext(e2e)
  const sessionId = scenario.session.id
  const popout = await openSupervisionBoard({ session, debuggingPort, consoleMessages, cspViolations, popoutDocumentCsps })
  try {
    // Every journey establishes its own preconditions: clear whatever a
    // previous (possibly failed) journey left, then arm exactly one request.
    await postStubStep(e2e, "reset")
    await postStubStep(e2e, armStep)
    await waitForCondition(async () => (await popout.evaluate(missionRowStateExpression(sessionId))) === "permission", {
      timeoutMs: 30_000,
      label: "permission state on the pop-out row",
    })
    const waitingBefore = await waitForCondition(
      async () => {
        const count = needsYouWaitingCount(await session.evaluate(needsYouLabelExpression))
        return count > 0 ? count : false
      },
      { timeoutMs: 30_000, label: "main window needs-you count" },
    )
    await waitForCondition(() => popout.evaluate(reviewRequestClickExpression(sessionId)), {
      timeoutMs: 15_000,
      label: "review-request control",
    })
    await waitForCondition(() => popout.evaluate(requestCardPresentExpression(pattern)), {
      timeoutMs: 15_000,
      label: "permission request card",
    })
    await waitForCondition(() => popout.evaluate(requestCardButtonClickExpression(pattern, buttonLabel)), {
      timeoutMs: 15_000,
      label: `${buttonLabel} control`,
    })
    await waitForCondition(
      async () => {
        const mine = (await readReplyRecords(e2e)).filter((record) => record.requestID === request.id)
        return mine.some((record) => record.accepted === true && record.reply === expectedReply)
      },
      { timeoutMs: 30_000, label: "recorded permission reply" },
    )
    await waitForCondition(() => popout.evaluate(requestClearedExpression(sessionId, pattern)), {
      timeoutMs: 30_000,
      label: "request cleared from the pop-out board",
    })
    await waitForCondition(
      async () => needsYouWaitingCount(await session.evaluate(needsYouLabelExpression)) === waitingBefore - 1,
      { timeoutMs: 30_000, label: "main window needs-you count after the reply" },
    )
    const popoverText = await readNeedsYouPopoverText(session)
    if (popoverText.includes(pattern)) throw new Error("The main window still shows the answered request")
    // Checked after the interface settled, so a duplicate submission has had
    // its chance to land in the log as a second, rejected attempt.
    const problems = findReplyAttemptProblems(await readReplyRecords(e2e), {
      requestID: request.id,
      expectedReply,
      projectDirectory: scenario.projectDirectory,
    })
    if (problems.length) throw new Error(problems.join("; "))
    return {
      name,
      ok: true,
      detail: `reply "${expectedReply}" recorded once for ${request.id}; request cleared from the pop-out board and the main window`,
    }
  } finally {
    popout.close()
  }
}

export const journeyNeedsYouApprove = async (context) =>
  drivePermissionJourney(context, {
    armStep: "approve",
    request: context.e2e?.scenario?.approveRequest ?? { id: "" },
    pattern: context.e2e?.scenario?.approveRequest?.patterns?.[0] ?? "",
    buttonLabel: "Allow once",
    expectedReply: "once",
    name: "needs-you-approve",
  })

export const journeyNeedsYouDeny = async (context) =>
  drivePermissionJourney(context, {
    armStep: "deny",
    request: context.e2e?.scenario?.denyRequest ?? { id: "" },
    pattern: context.e2e?.scenario?.denyRequest?.patterns?.[0] ?? "",
    buttonLabel: "Deny",
    expectedReply: "reject",
    name: "needs-you-deny",
  })

export const journeyGoalRow = async ({ session, debuggingPort, consoleMessages, cspViolations, popoutDocumentCsps, e2e }) => {
  const scenario = requireE2eContext(e2e)
  const sessionId = scenario.session.id
  const goal = scenario.goal
  const updatedGoal = scenario.updatedGoal ?? goal
  const popout = await openSupervisionBoard({ session, debuggingPort, consoleMessages, cspViolations, popoutDocumentCsps })
  try {
    // No leftover permission may outrank the goal: start from a clean stub.
    await postStubStep(e2e, "reset")
    const before = await popout.evaluate(goalLineTextExpression(sessionId))
    if (before) throw new Error(`A goal line was visible before the goal step: ${before}`)
    await postStubStep(e2e, "goal")
    await waitForCondition(async () => (await popout.evaluate(missionRowStateExpression(sessionId))) === "goal", {
      timeoutMs: 30_000,
      label: "goal state on the pop-out row",
    })
    const line = await popout.evaluate(goalLineTextExpression(sessionId))
    const fragments = [
      "Blocked",
      goal.objective,
      `${goal.tokensUsed} of ${goal.tokenBudget} tokens used`,
      `${goal.remainingTokens} tokens left`,
    ]
    for (const fragment of fragments) {
      if (!line.includes(fragment)) throw new Error(`The goal line is missing ${JSON.stringify(fragment)}: ${line}`)
    }
    // Foreign-goal isolation, established in stream order: the foreign frame
    // is emitted as its own step, then a later revision of the target goal.
    // The stream is ordered, so once the row shows the later revision the
    // foreign frame ahead of it was processed -- and did not touch the row.
    await postStubStep(e2e, "foreign-goal")
    await postStubStep(e2e, "goal-revision")
    const updatedLine = await waitForCondition(
      async () => {
        const text = await popout.evaluate(goalLineTextExpression(sessionId))
        const updated = [
          updatedGoal.objective,
          `${updatedGoal.tokensUsed} of ${updatedGoal.tokenBudget} tokens used`,
          `${updatedGoal.remainingTokens} tokens left`,
        ]
        return updated.every((fragment) => text.includes(fragment)) ? text : false
      },
      { timeoutMs: 30_000, label: "later goal revision on the pop-out row" },
    )
    if (!updatedLine.includes("Blocked")) throw new Error(`The revised goal line lost its status label: ${updatedLine}`)
    if ((await popout.evaluate(missionRowStateExpression(sessionId))) !== "goal") {
      throw new Error("The pop-out row no longer shows the goal state after the foreign goal and revision")
    }
    const rowText = await popout.evaluate(missionRowTextExpression(sessionId))
    if (rowText.includes(scenario.foreignGoal.objective)) {
      throw new Error("A goal event for another session changed the scripted row")
    }
    const rowHtml = await popout.evaluate(missionRowHtmlExpression(sessionId))
    if (rowHtml.includes(scenario.foreignGoal.sessionID)) {
      throw new Error("The scripted row carries the foreign session id")
    }
    await waitForCondition(async () => needsYouWaitingCount(await session.evaluate(needsYouLabelExpression)) > 0, {
      timeoutMs: 30_000,
      label: "main window needs-you count after the goal",
    })
    const popoverText = await readNeedsYouPopoverText(session)
    if (!popoverText.includes(updatedGoal.objective)) {
      throw new Error("The main window does not show the revised goal objective")
    }
    return {
      name: "goal-row",
      ok: true,
      detail: `pop-out row shows Blocked, the objective and "${goal.tokensUsed} of ${goal.tokenBudget} tokens used, ${goal.remainingTokens} tokens left", then the later revision "${updatedGoal.objective}" with "${updatedGoal.tokensUsed} of ${updatedGoal.tokenBudget} tokens used, ${updatedGoal.remainingTokens} tokens left" after a foreign goal for another session left it unchanged; the main window agrees`,
    }
  } finally {
    popout.close()
  }
}

// Security and exception checks run after interactions, including reload.
export const JOURNEYS = [journeyBoot, journeyPreloadBridge, journeySettings, journeySupervisionPopout, journeyReload]
// Opt-in (`--scripted`): they need the scripted stub session and a runtime-readiness barrier. They are not part of the
// default run until they pass reliably (see .internal/reports/E2E-2026-10-19-scripted-journeys.md).
export const SCRIPTED_JOURNEYS = [journeyNeedsYouApprove, journeyNeedsYouDeny, journeyGoalRow]
export const FINAL_CHECKS = [journeyCspClean, journeyRendererErrors]
