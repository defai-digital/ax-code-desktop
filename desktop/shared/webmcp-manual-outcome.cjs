"use strict"

const MANUAL_TOOL_FAILURE_REASONS = {
  "application-error": ["application-error"],
  timeout: ["timeout"],
  cancelled: ["cancelled"],
  uncertain: ["provider-gone", "native-failure"],
  failed: [
    "page-changed",
    "definition-changed",
    "invalid-input",
    "input-too-large",
    "result-too-large",
    "native-failure",
  ],
}

// Includes form/admission outcomes returned before native dispatch.
const MANUAL_TOOL_OUTCOMES = Object.freeze([
  "completed",
  ...Object.keys(MANUAL_TOOL_FAILURE_REASONS),
  "stale-form",
  "invalid-input",
])

// Mirror the transcript's application-error signals. Transport completion alone is not tool success.
function manualToolResult(result) {
  let output = result.output
  if (typeof output === "string") {
    try {
      output = JSON.parse(output)
    } catch {
      /* Plain text is a normal tool output. */
    }
  }
  if (output?.untrusted === true && output.result && typeof output.result === "object") output = output.result
  const status = typeof output?.status === "string" ? output.status.trim() : ""
  // Explicit terminal statuses take precedence over generic error flags on both surfaces.
  if (/^timeout$/i.test(status)) return { ok: false, outcome: "timeout", reason: "timeout", output: result.output }
  if (/^(canceled|cancelled|aborted)$/i.test(status))
    return { ok: false, outcome: "cancelled", reason: "cancelled", output: result.output }
  const applicationError =
    output &&
    typeof output === "object" &&
    (output.isError === true ||
      output.ok === false ||
      (typeof output.status === "string" &&
        /^(error|failed|canceled|cancelled|timeout|aborted)$/i.test(output.status.trim())) ||
      (typeof output.error === "string" && output.error.trim().length > 0) ||
      // A structured error, as the builder guide recommends: { error: { field, constraint, got } }.
      (output.error !== null &&
        typeof output.error === "object" &&
        !Array.isArray(output.error) &&
        Object.keys(output.error).length > 0) ||
      (typeof output.errorText === "string" && output.errorText.trim().length > 0))
  return applicationError
    ? { ok: false, outcome: "application-error", reason: "application-error", output: result.output }
    : { ok: true, outcome: "completed", output: result.output }
}

function manualToolFailure(error) {
  // This metadata is made by the adapter, never copied from page exception text.

  if (
    Object.hasOwn(MANUAL_TOOL_FAILURE_REASONS, error?.outcome) &&
    MANUAL_TOOL_FAILURE_REASONS[error.outcome].includes(error.reason)
  )
    return { ok: false, outcome: error.outcome, reason: error.reason }
  return { ok: false, outcome: "uncertain", reason: "provider-gone" }
}

module.exports = { manualToolResult, manualToolFailure, MANUAL_TOOL_OUTCOMES }
