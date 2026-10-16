import {
  notConfiguredResult,
  readProviderAuthEntry,
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  resolveWindowLabel,
  asNonEmptyString,
} from "../utils/index.js"

export const providerId = "wafer"
export const providerName = "Wafer.ai"
export const aliases = ["wafer", "wafer-ai", "wafer_ai", "wafer.ai"]

const WAFER_QUOTA_URL = "https://pass.wafer.ai/v1/inference/quota"
const WAFER_WINDOW_SECONDS = 5 * 3600

export const isConfigured = () => {
  const entry = readProviderAuthEntry(aliases)
  return Boolean(entry?.key || entry?.token)
}

/**
 * Map the Wafer quota payload to usage windows. Returns null when the payload carries no quota data
 * at all, which the caller reports as an API error.
 */
export const transformWaferWindows = (payload) => {
  const remaining = toNumber(payload?.remaining_included_requests)
  const limit = toNumber(payload?.included_request_limit)
  const overage = toNumber(payload?.overage_request_count)
  const usedPercentRaw = toNumber(payload?.current_period_used_percent)
  const windowStart = toTimestamp(payload?.window_start)
  const windowEnd = toTimestamp(payload?.window_end)
  const planTier = asNonEmptyString(payload?.plan_tier)

  if (remaining === null && limit === null && overage === null && usedPercentRaw === null) {
    return null
  }

  const hasOverage = overage !== null && overage > 0
  // Overage means the included quota is spent, so a >100 percent is meaningful there. An absent
  // percent must stay null: defaulting it to 0 made the UI draw a 0%-used bar for a provider whose
  // usage is simply unknown, and report "+N overage" alongside it.
  const usedPercent =
    usedPercentRaw === null
      ? null
      : hasOverage
        ? Math.max(0, usedPercentRaw)
        : Math.max(0, Math.min(100, usedPercentRaw))

  const windowSeconds =
    windowStart !== null && windowEnd !== null ? Math.round((windowEnd - windowStart) / 1000) : WAFER_WINDOW_SECONDS
  const windowLabel = resolveWindowLabel(windowSeconds)

  let valueLabel = null
  if (remaining !== null && limit !== null) {
    const parts = []
    if (planTier) parts.push(planTier)
    parts.push(`${remaining} / ${limit} left`)
    if (hasOverage) parts.push(`+${overage} overage`)
    valueLabel = parts.join(" · ")
  }

  const window = toUsageWindow({
    usedPercent,
    windowSeconds,
    resetAt: windowEnd,
    valueLabel,
  })

  return { windows: { [windowLabel]: window }, windowLabel }
}

export const fetchQuota = async () => {
  const entry = readProviderAuthEntry(aliases)
  const apiKey = entry?.key ?? entry?.token

  if (!apiKey) {
    return notConfiguredResult({ providerId, providerName })
  }

  const timeoutSignal = AbortSignal.timeout(15_000)

  try {
    const response = await fetch(WAFER_QUOTA_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Accept-Encoding": "identity",
      },
      signal: timeoutSignal,
    })

    if (!response.ok) {
      response.body?.cancel()
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      })
    }

    const payload = await response.json()
    const transformed = transformWaferWindows(payload)
    if (!transformed) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: "No quota data in response",
      })
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows: transformed.windows },
    })
  } catch (error) {
    // `AbortSignal.timeout()` aborts with a DOMException named "TimeoutError", never "AbortError" — the
    // repository handles that pairing in `ui/src/lib/ax-code/client.ts` and `search/crossSessionSearch.ts` for
    // the same reason. Testing only for "AbortError" made the friendly message dead code and left the raw
    // exception text ("The operation was aborted due to timeout") on the card.
    const isTimeout =
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError") &&
      timeoutSignal.aborted
    const isParseError = error instanceof SyntaxError
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: isTimeout
        ? "Request timed out"
        : isParseError
          ? "Invalid response from provider"
          : error instanceof Error
            ? error.message
            : "Request failed",
    })
  }
}
