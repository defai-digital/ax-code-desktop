"use strict"

const { createHmac } = require("node:crypto")
const { manualToolResult } = require("../../../shared/webmcp-manual-outcome.cjs")
const { redactWebMcpReport } = require("../../../shared/webmcp-redaction.mjs")

const CHECK_RUN_OUTCOMES = Object.freeze(["completed", "application-error", "timeout", "cancelled", "failed"])

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}

// Bind the unredacted input to its occurrence before writing a redacted report. The random key
// lives only in the launcher and engine for this check, so disk receipts cannot test secret guesses.
function runInputReceipt(key, index, run) {
  return createHmac("sha256", key)
    .update(JSON.stringify([index, run.name, canonical(run.input)]))
    .digest("hex")
}

function toolIdentityReceipt(key, name) {
  return createHmac("sha256", key).update(JSON.stringify(["catalog-tool", name])).digest("hex")
}

// Bind the fixed original-result classification to the same requested occurrence as its input.
function runOutcomeReceipt(key, index, run) {
  return createHmac("sha256", key)
    .update(JSON.stringify(["run-outcome", index, run.inputReceipt, run.outcome]))
    .digest("hex")
}

function recordCheckRun(key, index, run) {
  const outcome = run.error || !Object.hasOwn(run, "output")
    ? "failed"
    : manualToolResult({ output: run.output }).outcome
  const recorded = { ...run, outcome, inputReceipt: runInputReceipt(key, index, run) }
  return { ...recorded, outcomeReceipt: runOutcomeReceipt(key, index, recorded) }
}

// Project diagnostics only. Trusted classification and receipts never participate in echo matching.
// This helper is also safe to apply to an already projected disk report; it never classifies a payload.
function redactCheckReport(report) {
  const { runs, tools, ...rest } = report
  return {
    ...redactWebMcpReport(rest),
    ...(tools ? { tools: tools.map((tool) => {
      const { identityReceipt, ...payload } = tool
      return { ...redactWebMcpReport(payload), ...(identityReceipt !== undefined ? { identityReceipt } : {}) }
    }) } : {}),
    runs: (runs ?? []).map((run) => {
      const { outcome, inputReceipt, outcomeReceipt, ...payload } = run
      return { ...redactWebMcpReport(payload),
        ...(CHECK_RUN_OUTCOMES.includes(outcome) ? { outcome } : {}), inputReceipt, outcomeReceipt }
    }),
  }
}

module.exports = { runInputReceipt, toolIdentityReceipt, runOutcomeReceipt, recordCheckRun, redactCheckReport, CHECK_RUN_OUTCOMES }
