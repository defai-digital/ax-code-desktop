"use strict"

const { createHmac } = require("node:crypto")

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

module.exports = { runInputReceipt, toolIdentityReceipt }
