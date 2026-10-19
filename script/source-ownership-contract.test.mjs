import { describe, expect, it } from "vitest"
import {
  assertSourceOwnership,
  repositoryRoot,
  sourceOwnershipViolations,
  workspaceDeclaresDesktopPackages,
} from "./source-ownership-contract.mjs"

describe("AX Code Desktop source ownership contract", () => {
  it("owns the tracked Desktop source independently of approved release stage", () => {
    const result = sourceOwnershipViolations(repositoryRoot)
    expect(result.violations).toEqual([])
    expect(result.desktopFileCount).toBeGreaterThan(2_700)
    expect(assertSourceOwnership(repositoryRoot)).toEqual(result)
  })

  it("does not accept a commented-out workspace glob", () => {
    expect(workspaceDeclaresDesktopPackages("packages:\n  - desktop/packages/*\n")).toBe(true)
    expect(workspaceDeclaresDesktopPackages("packages:\n  - desktop/packages/* # reviewed\n")).toBe(true)
    expect(workspaceDeclaresDesktopPackages("packages:\n  # desktop/packages/*\n  - other/packages/*\n")).toBe(false)
    expect(workspaceDeclaresDesktopPackages("packages:\n  - other/packages/* # desktop/packages/*\n")).toBe(false)
  })
})
