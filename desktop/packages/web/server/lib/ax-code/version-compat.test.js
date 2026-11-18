import { describe, expect, it } from "vitest"
import { compareAxCodeVersions } from "../../../../../shared/ax-code-version.mjs"
import { MIN_SUPPORTED_AX_CODE_VERSION, evaluateAxCodeCompatibility } from "./version-compat.js"

describe("compareAxCodeVersions", () => {
  it("orders core versions numerically", () => {
    expect(compareAxCodeVersions("5.12.1", "5.11.1")).toBeGreaterThan(0)
    expect(compareAxCodeVersions("5.11.1", "5.11.1")).toBe(0)
    expect(compareAxCodeVersions("5.9.0", "5.11.0")).toBeLessThan(0)
    expect(compareAxCodeVersions("10.0.0", "9.99.99")).toBeGreaterThan(0)
  })

  it("handles v prefixes, build metadata, and prereleases", () => {
    expect(compareAxCodeVersions("v5.12.0", "5.12.0")).toBe(0)
    expect(compareAxCodeVersions("5.12.0+build.7", "5.12.0")).toBe(0)
    expect(compareAxCodeVersions("5.12.0-beta.1", "5.12.0")).toBeLessThan(0)
    expect(compareAxCodeVersions("5.12.0-custombuild", "5.12.0")).toBe(0)
  })

  it("preserves numeric shorthand and rejects out-of-range components", () => {
    expect(compareAxCodeVersions("7.24", "7.24.0")).toBe(0)
    expect(compareAxCodeVersions("7.24.1-next2+local", "7.24.1")).toBeLessThan(0)
    expect(compareAxCodeVersions("9007199254740992.1.0", "7.24.1")).toBeNull()
    expect(compareAxCodeVersions("7.24.1", "7.24.1junk")).toBeNull()
  })

  it("trims version values before comparison", () => {
    expect(compareAxCodeVersions(" v5.12.0 ", "5.12.0")).toBe(0)
    expect(compareAxCodeVersions(" 5.12.1 ", "5.12.0")).toBeGreaterThan(0)
  })
})

describe("evaluateAxCodeCompatibility", () => {
  it("accepts versions at or above the minimum", () => {
    expect(evaluateAxCodeCompatibility(MIN_SUPPORTED_AX_CODE_VERSION).compatible).toBe(true)
    expect(evaluateAxCodeCompatibility("99.0.0").compatible).toBe(true)
  })

  it("rejects versions below the minimum", () => {
    const result = evaluateAxCodeCompatibility("5.10.0")
    expect(result.compatible).toBe(false)
    expect(result.minSupportedVersion).toBe(MIN_SUPPORTED_AX_CODE_VERSION)
  })

  it("returns null compatibility when the version is unknown", () => {
    expect(evaluateAxCodeCompatibility(null).compatible).toBeNull()
    expect(evaluateAxCodeCompatibility("").compatible).toBeNull()
    expect(evaluateAxCodeCompatibility("not-a-version").compatible).toBeNull()
  })

  it("normalizes v prefixes", () => {
    expect(evaluateAxCodeCompatibility("v5.11.1").version).toBe("5.11.1")
  })

  it("normalizes surrounding whitespace and build metadata", () => {
    expect(evaluateAxCodeCompatibility(" v5.11.1+local ").version).toBe("5.11.1")
  })

  it("honors an explicit minimum override", () => {
    expect(evaluateAxCodeCompatibility("5.11.1", "5.12.0").compatible).toBe(false)
  })
})
