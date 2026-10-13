import { describe, expect, test } from "vitest"

import { extractMessageModelRef } from "./messageModelRef"

describe("extractMessageModelRef", () => {
  test("reads the provider, model and variant recorded on the message", () => {
    expect(
      extractMessageModelRef({
        model: { providerID: "anthropic", modelID: "claude-sonnet", variant: "high" },
      }),
    ).toEqual({ agent: undefined, providerID: "anthropic", modelID: "claude-sonnet", variant: "high" })
  })

  test("treats absent, blank and whitespace-only fields as undefined", () => {
    expect(extractMessageModelRef({})).toEqual({
      agent: undefined,
      providerID: undefined,
      modelID: undefined,
      variant: undefined,
    })
    expect(
      extractMessageModelRef({ model: { providerID: "   ", modelID: "" }, agent: "  ", mode: "\n" }),
    ).toEqual({ agent: undefined, providerID: undefined, modelID: undefined, variant: undefined })
  })

  test("falls back to the legacy mode field when agent is blank", () => {
    expect(extractMessageModelRef({ agent: "planner" }).agent).toBe("planner")
    expect(extractMessageModelRef({ mode: "build" }).agent).toBe("build")
    expect(extractMessageModelRef({ agent: " ", mode: "build" }).agent).toBe("build")
  })

  test("prefers model.variant over the legacy top-level variant", () => {
    expect(extractMessageModelRef({ model: { variant: "high" }, variant: "low" }).variant).toBe("high")
    expect(extractMessageModelRef({ variant: "low" }).variant).toBe("low")
    // The fallback is nullish-only, so a present-but-blank model.variant does not
    // fall through to the legacy top-level field. This matches the previous
    // inline implementation exactly.
    expect(extractMessageModelRef({ model: { variant: "  " }, variant: "low" }).variant).toBeUndefined()
  })

  test("returns the raw value without trimming it", () => {
    expect(extractMessageModelRef({ model: { modelID: " claude-sonnet " } }).modelID).toBe(" claude-sonnet ")
  })
})
