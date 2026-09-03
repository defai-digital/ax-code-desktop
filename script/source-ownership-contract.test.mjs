import { describe, expect, it } from "vitest"
import { assertSourceOwnership, repositoryRoot, sourceOwnershipViolations } from "./source-ownership-contract.mjs"

describe("AX Coder source ownership contract", () => {
  it("owns the tracked Desktop source while public release stays frozen", () => {
    const result = sourceOwnershipViolations(repositoryRoot)
    expect(result.violations).toEqual([])
    expect(result.desktopFileCount).toBeGreaterThan(2_700)
    expect(assertSourceOwnership(repositoryRoot)).toEqual(result)
  })
})
