#!/usr/bin/env node
// Desktop end-to-end harness (SPEC-2026-10-19-desktop-e2e-harness-v1).
// Usage: pnpm run e2e:desktop [-- --app "/path/AX Code.app"] [--artifacts dir] [--timeout-ms n]
import fs from "node:fs/promises"
import path from "node:path"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { CdpSession, isAppPageTarget, waitForCondition, waitForTarget } from "./cdp.mjs"
import { CSP_RECORDER_SCRIPT, FINAL_CHECKS, JOURNEYS, SHELL_READY_EXPRESSION, waitForRuntimeReadiness } from "./journeys.mjs"
import { launchDesktop } from "./launch.mjs"

export const parseArgs = (argv) => {
  const result = { app: "", artifacts: "", timeoutMs: 60_000 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === "--app" && next) {
      result.app = next
      index += 1
    } else if (arg === "--artifacts" && next) {
      result.artifacts = next
      index += 1
    } else if (arg === "--timeout-ms" && next) {
      const parsed = Number(next)
      if (Number.isFinite(parsed) && parsed > 0) result.timeoutMs = parsed
      index += 1
    }
  }
  return result
}

export const summarize = (results) => {
  const failed = results.filter((result) => !result.ok)
  const lines = results.map((result) => `${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`)
  return { ok: failed.length === 0 && results.length > 0, lines, failed: failed.map((result) => result.name) }
}

const headerValue = (headers, name) => {
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === name)
  return key ? String(headers[key]) : ""
}

const writeArtifacts = async ({ dir, launch, consoleMessages, session, results }) => {
  if (!dir) return
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "stdout.log"), launch.stdout.join(""))
  await fs.writeFile(path.join(dir, "stderr.log"), launch.stderr.join(""))
  await fs.writeFile(path.join(dir, "console.json"), `${JSON.stringify(consoleMessages, null, 2)}\n`)
  await fs.writeFile(path.join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`)
  if (session) {
    try {
      const { data } = await session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(dir, "screenshot.png"), Buffer.from(data, "base64"))
    } catch {}
  }
}

export const runHarness = async ({ app = "", artifacts = "", timeoutMs = 60_000, journeys = JOURNEYS } = {}) => {
  const launch = await launchDesktop({ app })
  const consoleMessages = []
  const results = []
  let session = null
  try {
    const target = await waitForTarget(launch.debuggingPort, isAppPageTarget, { timeoutMs })
    session = await CdpSession.connect(target.webSocketDebuggerUrl)
    session.on("Runtime.consoleAPICalled", (params) => {
      const text = (params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ")
      consoleMessages.push({ source: "console", level: params.type, text })
    })
    session.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails || {}
      consoleMessages.push({
        source: "exception",
        level: "error",
        text: details.exception?.description || details.text,
      })
    })
    session.on("Log.entryAdded", (params) => {
      const entry = params.entry || {}
      consoleMessages.push({ source: entry.source || "log", level: entry.level, text: entry.text })
    })
    let documentCsp = ""
    let documentUrl = ""
    session.on("Network.responseReceived", (params) => {
      if (params.type === "Document" && !documentCsp) {
        documentCsp = headerValue(params.response?.headers, "content-security-policy")
        documentUrl = params.response?.url || ""
      }
    })
    await Promise.all([
      session.send("Runtime.enable"),
      session.send("Log.enable"),
      session.send("Network.enable"),
      session.send("Page.enable"),
    ])
    const cspViolations = []
    session.on("Runtime.bindingCalled", (params) => {
      if (params.name === "__axE2eReportCsp") cspViolations.push(params.payload)
    })
    await session.send("Runtime.addBinding", { name: "__axE2eReportCsp" })
    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: CSP_RECORDER_SCRIPT })
    const popoutDocumentCsps = []
    // Runtime-readiness barrier: under load the app bootstrap can exhaust its
    // own attempts before the stub runtime is reachable. Wait for the stub
    // origin file and for the app to report the runtime healthy through its
    // own server, reload once against the live runtime, and only then let
    // the first-load wait and the journeys run.
    await waitForRuntimeReadiness({
      session,
      stubOriginPath: launch.stubOriginPath,
      scenario: launch.scenario,
      timeoutMs,
    })
    // Let main finish its own first load (interrupting it is a startup failure),
    // then reload so the violation recorder and network capture see a whole load.
    await waitForCondition(() => session.evaluate(SHELL_READY_EXPRESSION), { timeoutMs, label: "first load" })
    await session.send("Page.reload", { ignoreCache: true })
    await waitForCondition(() => documentCsp || documentUrl, { timeoutMs, label: "main document response" }).catch(
      () => {},
    )
    const packaged = documentUrl.startsWith("app://") || target.url.startsWith("app://")
    for (const journey of [...journeys, ...FINAL_CHECKS]) {
      const started = performance.now()
      try {
        results.push(
          await journey({
            session,
            documentCsp,
            consoleMessages,
            packaged,
            cspViolations,
            popoutDocumentCsps,
            debuggingPort: launch.debuggingPort,
            e2e: {
              scenario: launch.scenario,
              repliesPath: launch.repliesPath,
              stubOriginPath: launch.stubOriginPath,
            },
          }),
        )
      } catch (error) {
        results.push({ name: journey.name.replace(/^journey/, "").toLowerCase(), ok: false, detail: error.message })
      }
      results.at(-1).durationMs = Math.round(performance.now() - started)
      if (artifacts) {
        // Capture each journey before later navigation changes the evidence.
        await writeArtifacts({
          dir: path.join(artifacts, results.at(-1).name),
          launch,
          consoleMessages,
          session,
          results: [results.at(-1)],
        }).catch(() => {})
      }
    }
    if (cspViolations.length) results.push({ name: "csp-history", ok: false, detail: cspViolations.join("; ") })
    return { ...summarize(results), results, consoleMessages }
  } catch (error) {
    results.push({ name: "harness", ok: false, detail: error.message })
    return { ...summarize(results), results, consoleMessages }
  } finally {
    await writeArtifacts({ dir: artifacts, launch, consoleMessages, session, results }).catch(() => {})
    session?.close()
    await launch.stop()
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2))
  runHarness(args)
    .then((outcome) => {
      for (const line of outcome.lines) console.log(line)
      if (!outcome.ok) {
        console.error(`Desktop e2e failed: ${outcome.failed.join(", ") || "no journeys ran"}`)
        process.exit(1)
      }
      console.log("Desktop e2e passed")
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
