import { describe, expect, test, vi } from "vitest"

import { applySessionRetentionAction } from "./useSessionAutoCleanup"

const scopedSdk = (overrides: { update?: unknown; delete?: unknown } = {}) =>
  ({
    session: {
      update: vi.fn(async () => ({ data: {} })),
      delete: vi.fn(async () => ({ data: true })),
      ...overrides,
    },
  }) as never

describe("applySessionRetentionAction", () => {
  test("reports a rejected archive as not completed", async () => {
    // The generated SDK resolves with `{ error }` instead of throwing, so a
    // rejected cleanup used to be counted as completed.
    const sdk = scopedSdk({ update: vi.fn(async () => ({ error: { message: "Internal error" } })) })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "archive")).resolves.toBe(false)
  })

  test("reports a rejected delete as not completed", async () => {
    const sdk = scopedSdk({ delete: vi.fn(async () => ({ error: { message: "Internal error" } })) })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).resolves.toBe(false)
  })

  test("reports a confirmed cleanup as completed", async () => {
    await expect(applySessionRetentionAction(scopedSdk(), "ses_1", "/repo", "delete")).resolves.toBe(true)
  })

  test("rethrows a transport error so the caller records the failure", async () => {
    const sdk = scopedSdk({
      delete: vi.fn(async () => {
        throw new Error("offline")
      }),
    })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).rejects.toThrow("offline")
  })
})
