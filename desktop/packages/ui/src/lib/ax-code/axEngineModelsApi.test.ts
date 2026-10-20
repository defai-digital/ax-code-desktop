import { describe, expect, test } from "vitest"

import { assertAxEngineModelsResponse } from "./axEngineModelsApi"

const complete = {
  eligibility: { supported: true, platform: "darwin", arch: "arm64", blockers: [], warnings: [] },
  dependency: { available: true, blockers: [] },
  server: { running: false, ready: false },
}

describe("assertAxEngineModelsResponse", () => {
  test("accepts a complete response unchanged", () => {
    expect(assertAxEngineModelsResponse(complete)).toBe(complete)
  })

  test("accepts an unsupported host", () => {
    const unsupported = { ...complete, eligibility: { ...complete.eligibility, supported: false } }
    expect(assertAxEngineModelsResponse(unsupported)).toBe(unsupported)
  })

  test.each([
    ["an empty object", {}],
    ["null", null],
    ["an array", []],
    ["a missing eligibility", { dependency: complete.dependency, server: complete.server }],
    ["a non-boolean supported flag", { ...complete, eligibility: { ...complete.eligibility, supported: "yes" } }],
    ["a non-object eligibility", { ...complete, eligibility: "yes" }],
  ])("rejects %s with a load error instead of a half-built object", (_label, value) => {
    expect(() => assertAxEngineModelsResponse(value)).toThrow("AX Engine status response is incomplete")
  })
})
