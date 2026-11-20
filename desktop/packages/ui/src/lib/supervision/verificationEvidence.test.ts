import { describe, expect, test } from "vitest"

import { normalizeVerificationEvidence } from "./verificationEvidence"

const envelope = (
  result: { passed: boolean; status: string; output?: string },
  extra: Record<string, unknown> = {},
) => ({
  schemaVersion: 1,
  workflow: "qa",
  result,
  ...extra,
})

describe("normalizeVerificationEvidence", () => {
  test("maps result.status failed onto the failed count and ignores output text", () => {
    expect(
      normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: false, status: "failed", output: "all checks passed" }),
          envelope({ passed: true, status: "passed", output: "1 failed, 0 passed" }),
          envelope({ passed: false, status: "failed" }),
        ],
      }),
    ).toEqual({ state: "failed", passed: 1, failed: 2, total: 3 })
  })

  test("counts timeout and error as failed and skipped or unavailable as pending", () => {
    expect(
      normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: false, status: "timeout" }),
          envelope({ passed: false, status: "error" }),
          envelope({ passed: false, status: "skipped" }),
          envelope({ passed: false, status: "unavailable" }),
        ],
      }),
    ).toEqual({ state: "failed", passed: 0, failed: 2, total: 4 })
    expect(
      normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: true, status: "passed" }),
          envelope({ passed: false, status: "skipped" }),
        ],
      }),
    ).toEqual({ state: "pending", passed: 1, failed: 0, total: 2 })
  })

  test("an empty envelope list is a recorded absence and a full pass is passed", () => {
    expect(normalizeVerificationEvidence({ envelopes: [] })).toEqual({
      state: "none",
      passed: 0,
      failed: 0,
      total: 0,
    })
    expect(
      normalizeVerificationEvidence({
        envelopes: [envelope({ passed: true, status: "passed" }), envelope({ passed: true, status: "passed" })],
      }),
    ).toEqual({ state: "passed", passed: 2, failed: 0, total: 2 })
  })

  test("uses the latest execution.endedAt and ignores an unparseable string", () => {
    const evidence = normalizeVerificationEvidence({
      envelopes: [
        envelope(
          { passed: true, status: "passed" },
          { execution: { endedAt: "2026-10-21T00:00:00.000Z" } },
        ),
        envelope(
          { passed: false, status: "failed" },
          { execution: { endedAt: "not-a-time" } },
        ),
        envelope(
          { passed: true, status: "passed" },
          { execution: { endedAt: "2026-10-21T01:00:00.000Z" } },
        ),
      ],
    })
    expect(evidence).toEqual({
      state: "failed",
      passed: 2,
      failed: 1,
      total: 3,
      updatedAt: Date.parse("2026-10-21T01:00:00.000Z"),
    })
  })

  test("does not turn a policy flag or a workflow pass rate into check counts", () => {
    expect(
      normalizeVerificationEvidence({
        verificationPolicyFailed: true,
        verificationPassRate: 0,
        verificationEnvelopeCount: 4,
        verificationSatisfied: false,
        reviewResults: [{ verificationPolicyFailed: true, summary: "policy failed" }],
        envelopes: [envelope({ passed: true, status: "passed" })],
      }),
    ).toEqual({ state: "passed", passed: 1, failed: 0, total: 1 })
  })

  test("returns null for a missing list, a newer schema, or an inconsistent result", () => {
    expect(normalizeVerificationEvidence(null)).toBeNull()
    expect(normalizeVerificationEvidence("2 failed")).toBeNull()
    expect(normalizeVerificationEvidence({ id: "ses_1", title: "Task" })).toBeNull()
    expect(normalizeVerificationEvidence({ envelopes: "none" })).toBeNull()
    expect(
      normalizeVerificationEvidence({
        envelopes: [{ schemaVersion: 2, workflow: "qa", result: { passed: false, status: "failed" } }],
      }),
    ).toBeNull()
    expect(
      normalizeVerificationEvidence({
        envelopes: [{ schemaVersion: 1, workflow: "refactor", result: { passed: false, status: "failed" } }],
      }),
    ).toBeNull()
    expect(
      normalizeVerificationEvidence({
        envelopes: [envelope({ passed: false, status: "flaky" })],
      }),
    ).toBeNull()
    expect(
      normalizeVerificationEvidence({
        envelopes: [envelope({ passed: true, status: "failed" })],
      }),
    ).toBeNull()
    expect(
      normalizeVerificationEvidence({
        envelopes: [envelope({ passed: false, status: "failed" }, { execution: { endedAt: 1_700_000_000_000 } })],
      }),
    ).toBeNull()
  })

  const ranOn = (commit: string, dirtyDigest: string | null = "content-v1:aa") => ({
    sourceState: { available: true, commit, dirtyDigest },
  })

  test("binds the result to the one commit every check ran on, whatever the content fingerprint", () => {
    expect(
      normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: true, status: "passed" }, ranOn("abc", "content-v1:aa")),
          envelope({ passed: true, status: "passed" }, ranOn("abc", "content-v1:bb")),
          envelope({ passed: true, status: "passed" }, ranOn("abc", null)),
        ],
      })?.source,
    ).toEqual({ commit: "abc" })
  })

  test("reports mixed when checks ran on different commits", () => {
    expect(
      normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: true, status: "passed" }, ranOn("abc")),
          envelope({ passed: true, status: "passed" }, ranOn("def")),
        ],
      })?.source,
    ).toBe("mixed")
  })

  test("different commits stay mixed even when another check names none", () => {
    expect(
      normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: true, status: "passed" }, ranOn("abc")),
          envelope({ passed: true, status: "passed" }, ranOn("def")),
          envelope({ passed: true, status: "passed" }),
        ],
      })?.source,
    ).toBe("mixed")
  })

  test("leaves the result unbound, with its counts, when any check does not name a readable commit", () => {
    for (const sourceState of [
      undefined,
      null,
      "abc",
      { available: false, commit: null, dirtyDigest: null },
      { available: "yes", commit: "abc", dirtyDigest: null },
      { available: true, commit: 7, dirtyDigest: null },
      { available: true, commit: "", dirtyDigest: null },
      { available: true, commit: null },
    ]) {
      const evidence = normalizeVerificationEvidence({
        envelopes: [
          envelope({ passed: true, status: "passed" }, ranOn("abc")),
          envelope({ passed: false, status: "failed" }, sourceState === undefined ? {} : { sourceState }),
        ],
      })
      expect(evidence).toEqual({ state: "failed", passed: 1, failed: 1, total: 2 })
    }
  })
})
