import { describe, expect, test, vi } from "vitest"

import { retryWhenRateLimited } from "./rateLimitRetry"

const reply = (status: number) => ({ response: { status } })

describe("retryWhenRateLimited", () => {
  test("retries a rate-limited call until the runtime accepts it", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200))
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})

    await expect(retryWhenRateLimited(request, { sleep })).resolves.toEqual(reply(200))
    expect(request).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000])
  })

  test("waits longer than the runtime's one-minute window before giving up", async () => {
    const request = vi.fn().mockResolvedValue(reply(429))
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})

    await expect(retryWhenRateLimited(request, { sleep })).resolves.toEqual(reply(429))
    const waited = sleep.mock.calls.reduce((total, [ms]) => total + ms, 0)
    expect(waited).toBeGreaterThan(60_000)
  })

  test("returns any other result without retrying", async () => {
    const request = vi.fn().mockResolvedValue(reply(500))
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})

    await expect(retryWhenRateLimited(request, { sleep })).resolves.toEqual(reply(500))
    expect(request).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
