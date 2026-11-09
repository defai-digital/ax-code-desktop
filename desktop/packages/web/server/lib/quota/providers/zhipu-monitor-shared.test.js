import { describe, expect, it } from "vitest"

import { findMcpToolsLimit, findPlanBudgetLimit, readEnvelopeError } from "./zhipu-monitor-shared.js"

describe("Zhipu monitor API envelope", () => {
  it("reports the failure the API puts inside an HTTP 200 body", () => {
    // A rejected key answers `{code, msg, success:false}`, which used to read as a successful
    // empty card: no windows and no reason.
    expect(readEnvelopeError({ code: 401, msg: "invalid api key", success: false })).toBe("invalid api key")
    expect(readEnvelopeError({ code: 500, success: false })).toBe("Usage request failed (500)")
    expect(readEnvelopeError({ code: 429, msg: "   " })).toBe("Usage request failed (429)")
  })

  it("leaves a normal payload alone", () => {
    expect(readEnvelopeError({ code: 200, msg: "ok", data: { limits: [] } })).toBeNull()
    expect(readEnvelopeError({ success: true, data: { limits: [] } })).toBeNull()
    expect(readEnvelopeError({ data: { limits: [] } })).toBeNull()
    expect(readEnvelopeError(null)).toBeNull()
  })
})

describe("Zhipu monitor API limits", () => {
  it("finds the plan budget under its current and its former name", () => {
    const credit = { type: "CREDIT_LIMIT", percentage: 10 }
    const tokens = { type: "TOKENS_LIMIT", percentage: 20 }
    const mcp = { type: "TIME_LIMIT", percentage: 30 }

    expect(findPlanBudgetLimit([mcp, credit])).toBe(credit)
    expect(findPlanBudgetLimit([tokens, mcp])).toBe(tokens)
    expect(findPlanBudgetLimit([mcp])).toBeNull()
    expect(findMcpToolsLimit([credit, mcp])).toBe(mcp)
    expect(findMcpToolsLimit([credit])).toBeNull()
  })
})
