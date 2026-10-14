import {
  buildResult,
  notConfiguredResult,
  readProviderAuthEntry,
  toNumber,
  toTimestamp,
  toUsageWindow,
} from "../utils/index.js"

import { fetchWithQuotaTimeout } from "../fetch.js"

export const transformMinimaxWindows = (model) => {
  const intervalTotal = toNumber(model.current_interval_total_count)
  const intervalUsed = toNumber(model.current_interval_usage_count)
  const intervalStartAt = toTimestamp(model.start_time)
  const intervalResetAt = toTimestamp(model.end_time)
  const weeklyTotal = toNumber(model.current_weekly_total_count)
  const weeklyUsed = toNumber(model.current_weekly_usage_count)
  const weeklyStartAt = toTimestamp(model.weekly_start_time)
  const weeklyResetAt = toTimestamp(model.weekly_end_time)

  const intervalUsedPercent =
    intervalTotal > 0 && intervalUsed !== null ? Math.max(0, Math.min(100, (intervalUsed / intervalTotal) * 100)) : null
  const weeklyUsedPercent =
    weeklyTotal > 0 && weeklyUsed !== null ? Math.max(0, Math.min(100, (weeklyUsed / weeklyTotal) * 100)) : null
  const intervalWindowSeconds =
    intervalStartAt && intervalResetAt && intervalResetAt > intervalStartAt
      ? Math.floor((intervalResetAt - intervalStartAt) / 1000)
      : null
  const weeklyWindowSeconds =
    weeklyStartAt && weeklyResetAt && weeklyResetAt > weeklyStartAt
      ? Math.floor((weeklyResetAt - weeklyStartAt) / 1000)
      : null

  return {
    "5h": toUsageWindow({
      usedPercent: intervalUsedPercent,
      windowSeconds: intervalWindowSeconds,
      resetAt: intervalResetAt,
    }),
    weekly: toUsageWindow({
      usedPercent: weeklyUsedPercent,
      windowSeconds: weeklyWindowSeconds,
      resetAt: weeklyResetAt,
    }),
  }
}

// The global and China MiniMax Token Plans differ only in identity and endpoint.
export const createMinimaxProvider = ({ providerId, providerName, endpoint }) => {
  const aliases = [providerId]

  const isConfigured = () => {
    const entry = readProviderAuthEntry(aliases)
    return Boolean(entry?.key || entry?.token)
  }

  const fetchQuota = async () => {
    const entry = readProviderAuthEntry(aliases)
    const apiKey = entry?.key ?? entry?.token

    if (!apiKey) {
      return notConfiguredResult({ providerId, providerName })
    }

    try {
      const response = await fetchWithQuotaTimeout(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
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
      const baseResp = payload?.base_resp
      if (baseResp && baseResp.status_code !== 0) {
        return buildResult({
          providerId,
          providerName,
          ok: false,
          configured: true,
          error: baseResp.status_msg || `API error: ${baseResp.status_code}`,
        })
      }

      const firstModel = payload?.model_remains?.[0]
      if (!firstModel) {
        return buildResult({
          providerId,
          providerName,
          ok: false,
          configured: true,
          error: "No model quota data available",
        })
      }

      const windows = transformMinimaxWindows(firstModel)

      return buildResult({
        providerId,
        providerName,
        ok: true,
        configured: true,
        usage: { windows },
      })
    } catch (error) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : "Request failed",
      })
    }
  }

  return { providerId, providerName, aliases, isConfigured, fetchQuota }
}
