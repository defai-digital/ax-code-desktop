/**
 * The runtime caps mutating `/session/*` requests at 120 per client per minute
 * and answers 429 above the cap, without a Retry-After header. Bulk actions send
 * one request per session, so a large selection hits the cap and every later
 * request fails at once. These delays add up to more than the one-minute window,
 * so a request that keeps getting 429 is retried after the window resets.
 */
const RATE_LIMIT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Repeat an SDK call while the runtime answers 429; any other result is returned as is. */
export async function retryWhenRateLimited<T extends { response?: { status: number } } | null | undefined>(
  request: () => Promise<T>,
  options?: { sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const sleepFor = options?.sleep ?? sleep
  let result = await request()
  for (const delay of RATE_LIMIT_RETRY_DELAYS_MS) {
    if (result?.response?.status !== 429) return result
    await sleepFor(delay)
    result = await request()
  }
  return result
}
