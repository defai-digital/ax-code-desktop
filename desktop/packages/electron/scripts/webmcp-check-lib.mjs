// Pure helpers for `pnpm run webmcp:check`: argument parsing, the page origin rule and exit codes.
import { createRequire } from "node:module"
import { redactWebMcpReport } from "../../../shared/webmcp-redaction.mjs"
import { isDeepStrictEqual } from "node:util"

const require = createRequire(import.meta.url)
const { runInputReceipt, toolIdentityReceipt } = require("./webmcp-check-receipt.cjs")
// The same mapping the project browser's Try it panel uses, so a CI check and a person agree on what failed.
const { manualToolResult } = require("../src/webmcp-manual-outcome.js")

export const EXIT = Object.freeze({ ok: 0, failed: 1, noTools: 2, toolError: 3, usage: 64 })

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

/** The project browser's rule: https anywhere, http only on loopback, no credentials in the URL. */
export function checkableUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname))) return url.href
  return null
}

/**
 * `--url <url>` (required), `--run <tool>=<json object>` (repeatable), `--expect-tools <a,b>`, `--json`,
 * `--timeout <ms>`. Returns `{ ok: false, error }` for usage errors; never throws.
 */
export function parseCheckArgs(argv) {
  const options = { url: null, runs: [], expectTools: [], json: false, verbose: false, timeoutMs: 15_000, settleMs: 5_000 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[(index += 1)]
    if (arg === "--") continue
    if (arg === "--json") options.json = true
    else if (arg === "--verbose") options.verbose = true
    else if (arg === "--url") options.url = next() ?? null
    else if (arg === "--expect-tools")
      options.expectTools = String(next() ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    else if (arg === "--timeout") {
      const value = Number(next())
      if (!Number.isInteger(value) || value < 1000 || value > 120_000)
        return { ok: false, error: "--timeout must be a whole number of milliseconds from 1000 to 120000" }
      options.timeoutMs = value
    } else if (arg === "--settle") {
      const value = Number(next())
      if (!Number.isInteger(value) || value < 0 || value > 60_000)
        return { ok: false, error: "--settle must be a whole number of milliseconds from 0 to 60000" }
      options.settleMs = value
    } else if (arg === "--run") {
      const spec = String(next() ?? "")
      const split = spec.indexOf("=")
      const name = split < 0 ? spec : spec.slice(0, split)
      if (!name) return { ok: false, error: "--run needs a tool name, for example --run add_task='{\"title\":\"x\"}'" }
      let input = {}
      if (split >= 0) {
        try {
          input = JSON.parse(spec.slice(split + 1))
        } catch {
          return { ok: false, error: `--run ${name}: the input is not valid JSON` }
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          return { ok: false, error: `--run ${name}: the input must be a JSON object` }
      }
      options.runs.push({ name, input })
    } else return { ok: false, error: `Unknown argument: ${arg}` }
  }
  if (!options.url) return { ok: false, error: "--url is required" }
  const url = checkableUrl(options.url)
  if (!url)
    return { ok: false, error: "--url must be https://, or http:// on localhost, 127.0.0.1 or [::1], without credentials" }
  return { ok: true, options: { ...options, url } }
}

/**
 * Classifies a check report and picks the exit code: a load or engine failure, no tools, an expected tool missing,
 * a run whose tool is missing or that returned an error, or success.
 */
export function evaluateReport(report, options, termination, receiptKey) {
  // Verify original identity before projecting diagnostics. Disk reports use keyed receipts;
  // legacy/raw reports without a key must match the actual input, never its redacted projection.
  const matchingInputs = options.runs?.map((requested, index) => {
    const run = report.runs?.[index]
    return Boolean(run && (receiptKey
      ? run.inputReceipt === runInputReceipt(receiptKey, index, requested)
      : run.name === requested.name && isDeepStrictEqual(run.input, requested.input)))
  })
  const identities = new Set((report.tools ?? []).map((tool) => receiptKey ? tool.identityReceipt : tool.name))
  const missingTools = options.expectTools.map((name) =>
    !identities.has(receiptKey ? toolIdentityReceipt(receiptKey, name) : name))
  report = redactWebMcpReport(report)
  options = redactWebMcpReport(options)
  const problems = []
  if (termination && (termination.timedOut || termination.code !== 0 || termination.signal))
    problems.push(
      termination.timedOut
        ? "The browser engine exceeded the check deadline."
        : `The browser engine exited abnormally (${termination.signal ?? termination.code}).`,
    )
  if (report.error) problems.push(`The page could not be checked: ${report.error}`)
  const recorded = report.runs ?? []
  // Match occurrences, not a set of names: --run may repeat a tool with different inputs.
  if (options.runs) {
    for (const [index, requested] of options.runs.entries()) {
      const run = recorded[index]
      if (
        !run ||
        !matchingInputs[index] ||
        (!Object.hasOwn(run, "output") && !run.error)
      )
        problems.push(`Requested run ${index + 1} (${requested.name}) has no matching completed report.`)
    }
    if (recorded.length > options.runs.length) problems.push("The report contains unexpected runs.")
  }
  const incomplete = problems.length > 0
  const names = new Set((report.tools ?? []).map((tool) => tool.name))
  if (names.size === 0) problems.push("The page registered no page tools.")
  for (const [index, name] of options.expectTools.entries()) if (missingTools[index]) problems.push(`Expected tool not registered: ${name}`)
  const runs = recorded.map((recordedRun) => {
    const run = { ...recordedRun }
    delete run.inputReceipt
    if (run.error) return { ...run, outcome: "failed", detail: run.error }
    if (!Object.hasOwn(run, "output")) return { ...run, outcome: "failed", detail: "The run has no result." }
    const mapped = manualToolResult({ output: run.output })
    return { ...run, outcome: mapped.outcome }
  })
  for (const run of runs)
    if (run.outcome !== "completed") problems.push(`${run.name}: ${run.outcome}${run.detail ? ` (${run.detail})` : ""}`)
  const exitCode = incomplete
    ? EXIT.failed
    : missingTools.some(Boolean)
      ? EXIT.failed
      : names.size === 0
        ? EXIT.noTools
        : runs.some((run) => run.outcome !== "completed")
          ? EXIT.toolError
          : EXIT.ok
  return { exitCode, problems, runs }
}
