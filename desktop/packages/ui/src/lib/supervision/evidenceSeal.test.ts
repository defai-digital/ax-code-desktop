import { describe, expect, test } from "vitest"

import { sealBlocksApproval, sealEvidence, shortCommit } from "./evidenceSeal"
import type { VerificationEvidence } from "./verificationEvidence"

const HEAD = "b4e19f28c0ffee00000000000000000000000000"
const OLD = "a3f9c1e000000000000000000000000000000000"

const passed = (overrides: Partial<VerificationEvidence> = {}): VerificationEvidence => ({
  state: "passed",
  passed: 4,
  failed: 0,
  total: 4,
  source: { commit: HEAD },
  ...overrides,
})

describe("sealEvidence", () => {
  test("checks on the commit at HEAD with nothing uncommitted are current, whatever their verdict", () => {
    for (const state of ["passed", "failed", "pending"] as const) {
      const seal = sealEvidence(passed({ state }), { headOid: HEAD, isClean: true })
      expect(seal).toEqual({ state: "current", reason: "same-commit", head: "b4e19f2", checked: "b4e19f2" })
      expect(sealBlocksApproval(seal)).toBe(false)
    }
  })

  test("goes stale when HEAD is a different commit, and names both", () => {
    const seal = sealEvidence(passed({ source: { commit: OLD } }), { headOid: HEAD, isClean: true })
    expect(seal).toEqual({ state: "stale", reason: "moved", head: "b4e19f2", checked: "a3f9c1e" })
    expect(sealBlocksApproval(seal)).toBe(true)
  })

  test("uncommitted changes now are never current, because the checks may not cover them", () => {
    const seal = sealEvidence(passed(), { headOid: HEAD, isClean: false })
    expect(seal).toMatchObject({ state: "unverified", reason: "dirty", checked: "b4e19f2" })
    expect(sealBlocksApproval(seal)).toBe(false)
  })

  test("a stale commit outranks the verdict and a failed refresh", () => {
    const head = { headOid: HEAD, isClean: true }
    expect(
      sealEvidence(passed({ state: "failed", failed: 1, passed: 3, source: { commit: OLD } }), head),
    ).toMatchObject({ state: "stale", reason: "moved" })
    expect(sealEvidence(passed({ stale: true, source: { commit: OLD } }), head)).toMatchObject({
      state: "stale",
      reason: "moved",
    })
  })

  test("checks that ran on different commits are stale and name no checked commit", () => {
    expect(sealEvidence(passed({ source: "mixed" }), { headOid: HEAD, isClean: true })).toMatchObject({
      state: "stale",
      reason: "mixed",
      checked: null,
    })
  })

  test("is unverified without a result, an attribution, a readable HEAD, or a current read", () => {
    const head = { headOid: HEAD, isClean: true }
    expect(sealEvidence(null, head)).toMatchObject({ state: "unverified", reason: "none" })
    expect(sealEvidence({ state: "none", passed: 0, failed: 0, total: 0 }, head)).toMatchObject({ reason: "none" })
    expect(sealEvidence(passed({ source: undefined }), head)).toMatchObject({
      state: "unverified",
      reason: "unattributed",
    })
    expect(sealEvidence(passed(), null)).toMatchObject({ state: "unverified", reason: "no-head", checked: "b4e19f2" })
    expect(sealEvidence(passed(), { headOid: null, isClean: true })).toMatchObject({ reason: "no-head" })
    expect(sealEvidence(passed(), { isClean: true })).toMatchObject({ reason: "no-head" })
    expect(sealEvidence(passed({ stale: true }), head)).toMatchObject({ state: "unverified", reason: "unread" })
  })
})

describe("shortCommit", () => {
  test("shortens to seven characters and keeps absence absent", () => {
    expect(shortCommit(HEAD)).toBe("b4e19f2")
    expect(shortCommit(null)).toBeNull()
    expect(shortCommit(undefined)).toBeNull()
    expect(shortCommit("")).toBeNull()
  })
})
