import { describe, expect, it } from "vitest"
import { assertSourceOwnership, repositoryRoot, sourceOwnershipViolations } from "./source-ownership-contract.mjs"

describe("AX Code Desktop source ownership contract", () => {
  it("owns the tracked Desktop source independently of approved release stage", () => {
    const result = sourceOwnershipViolations(repositoryRoot)
    expect(result.violations).toEqual([])
    expect(result.desktopFileCount).toBeGreaterThan(2_700)
    expect(assertSourceOwnership(repositoryRoot)).toEqual(result)
  })
})
