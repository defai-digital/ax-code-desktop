#!/usr/bin/env node
// `pnpm run webmcp:check -- --url <url> [--run tool='{"a":1}'] [--expect-tools a,b] [--json] [--timeout ms] [--settle ms] [--verbose]`
// Lists the page tools a web app registers and runs the named ones in the browser engine AX Code Desktop bundles,
// then exits 0 (ok), 1 (load failure or an expected tool missing), 2 (no tools), 3 (a run failed) or 64 (usage).
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { EXIT, evaluateReport, parseCheckArgs } from "./webmcp-check-lib.mjs"

import { redactWebMcpReport } from "../../../shared/webmcp-redaction.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const parsed = parseCheckArgs(process.argv.slice(2))
if (!parsed.ok) {
  console.error(`webmcp:check: ${redactWebMcpReport(parsed.error)}`)
  process.exit(EXIT.usage)
}
const { options } = parsed
let electron
try {
  electron = createRequire(import.meta.url)("electron")
} catch {
  console.error("webmcp:check: the bundled browser engine is not installed; run pnpm install")
  process.exit(EXIT.failed)
}
// One work directory holds the report and the throwaway browser profile; it is removed on every path below.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ax-webmcp-check-"))
const output = path.join(work, "report.json")
const profile = path.join(work, "profile")
const receiptKey = randomBytes(32).toString("hex")
const child = spawn(electron, [path.join(here, "webmcp-check-entry.cjs")], {
  env: {
    ...process.env,
    AX_WEBMCP_CHECK: JSON.stringify({ ...options, output, profile, receiptKey }),
    // The page is the subject of the check; the engine's own warnings and logs are noise unless asked for.
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
  stdio: ["ignore", "ignore", options.verbose ? "inherit" : "ignore"],
})
// Load, settle and every run each have their own limit; this only catches an engine that stops responding.
const budget = options.timeoutMs * (options.runs.length + 1) + options.settleMs + 15_000
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  child.kill()
}, budget)
const termination = await new Promise((resolve) => {
  child.on("exit", (code, signal) => resolve({ code, signal }))
  child.on("error", (error) => {
    console.error(`webmcp:check: cannot start the bundled browser engine (${redactWebMcpReport(error.message)}); run pnpm install`)
    resolve({ code: null, signal: null })
  })
})
clearTimeout(timer)
let report
try {
  report = redactWebMcpReport(JSON.parse(fs.readFileSync(output, "utf8")))
} catch {
  report = { error: `the browser engine exited (${termination.signal ?? termination.code}) without a report` }
}
try {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
} catch {
  // A locked profile file (Windows) must not change the result; the directory is in the system temp folder.
}
const result = evaluateReport(report, options, { ...termination, timedOut }, receiptKey)
if (options.json) {
  console.log(JSON.stringify({ url: redactWebMcpReport(options.url), tools: report.tools ?? [], runs: result.runs, problems: result.problems, exitCode: result.exitCode }, null, 2))
} else {
  console.log(`${redactWebMcpReport(options.url)}: ${(report.tools ?? []).length} page tools`)
  for (const tool of report.tools ?? []) {
    const hints = Object.entries(tool.annotations ?? {})
      .filter(([, value]) => value === true)
      .map(([name]) => name)
    console.log(`  ${tool.name}${tool.form ? " (form)" : ""}${hints.length ? ` [${hints.join(", ")}]` : ""} — ${tool.description}`)
  }
  for (const run of result.runs) console.log(`  run ${run.name}: ${run.outcome}`)
  for (const problem of result.problems) console.error(`  ✗ ${problem}`)
}
process.exit(result.exitCode)
