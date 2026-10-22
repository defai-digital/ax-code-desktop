import { describe, expect, test } from "vitest"

import { extractMessageModelRef, isOlderUserMessage, isServerChosenModelOrigin } from "./messageModelRef"

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

  test("keeps a request origin and ignores a blank one", () => {
    expect(extractMessageModelRef({ modelOrigin: "request" }).modelOrigin).toBe("request")
    expect(extractMessageModelRef({ modelOrigin: "  " }).modelOrigin).toBeUndefined()
  })
})

describe("isServerChosenModelOrigin", () => {
  test("a missing origin or an explicit request is the user's model", () => {
    expect(isServerChosenModelOrigin(undefined)).toBe(false)
    expect(isServerChosenModelOrigin("request")).toBe(false)
  })

  test("agent, route, session, fallback, and unknown origins are not the user's pick", () => {
    for (const origin of ["agent", "complexity", "hybrid", "session-or-config", "fallback", "future-route"]) {
      expect(isServerChosenModelOrigin(origin)).toBe(true)
    }
  })

  test("treats a padded request label as the user's model", () => {
    expect(isServerChosenModelOrigin(" request ")).toBe(false)
  })
})

describe("isOlderUserMessage", () => {
  test("restores when nothing has been observed yet, including an equal id", () => {
    expect(isOlderUserMessage("", "msg_b")).toBe(false)
    expect(isOlderUserMessage("msg_b", "msg_b")).toBe(false)
    expect(isOlderUserMessage("msg_a", "msg_b")).toBe(false)
  })

  test("ignores the previous message revealed when a failed send rolls back", () => {
    expect(isOlderUserMessage("msg_b", "msg_a")).toBe(true)
  })
})
