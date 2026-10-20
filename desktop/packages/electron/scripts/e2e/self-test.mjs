#!/usr/bin/env node
// Prove the harness rejects real browser failures, including failures erased
// from the document by navigation. No live provider or external server is used.
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot, journeyPreloadBridge, journeyReload } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"

const journeyInjectFailures = async ({ session, consoleMessages }) => {
  await session.evaluate(`(() => {
    const script = document.createElement("script")
    script.src = "https://invalid.example/ax-e2e-forbidden.js"
    document.head.appendChild(script)
    setTimeout(() => { throw new Error("AX_E2E_EXPECTED_RENDERER_FAILURE") }, 0)
  })()`)
  await waitForCondition(() => session.evaluate("window.__axE2eCspViolations.length > 0"), {
    label: "deliberate CSP violation",
  })
  await waitForCondition(
    () =>
      consoleMessages.some(
        (entry) => entry.source === "exception" && entry.text.includes("AX_E2E_EXPECTED_RENDERER_FAILURE"),
      ),
    {
      label: "deliberate uncaught renderer exception",
    },
  )
  return { name: "inject-failures", ok: true, detail: "browser emitted both expected failures before reload" }
}

const result = await runHarness({
  ...parseArgs(process.argv.slice(2)),
  journeys: [journeyBoot, journeyPreloadBridge, journeyInjectFailures, journeyReload],
})
for (const line of result.lines) console.log(line)
// CSP console messages can also fail csp-clean; both mandatory failure signals
// must survive the reload and unrelated journey failures must remain visible.
const expected = new Set(["renderer-errors", "csp-history", "csp-clean"])
const passed =
  !result.ok &&
  result.failed.includes("renderer-errors") &&
  result.failed.includes("csp-history") &&
  result.failed.every((name) => expected.has(name))
console.log(passed ? "Harness failure-detection self-test passed" : "Harness failure-detection self-test failed")
process.exitCode = passed ? 0 : 1
