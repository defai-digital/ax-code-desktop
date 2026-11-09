import {
  notConfiguredResult,
  readProviderAuthEntry,
  buildResult,
  toUsageWindow,
  resolveWindowSeconds,
  resolveWindowLabel,
  normalizeTimestamp,
} from "../utils/index.js"

import { discardResponseBody, fetchWithQuotaTimeout } from "../fetch.js"
import { readEnvelopeError } from "./zhipuai-coding-plan.js"

export const providerId = "zai-coding-plan"
export const providerName = "z.ai"
export const aliases = ["zai-coding-plan", "zai", "z.ai"]

export const isConfigured = () => {
  const entry = readProviderAuthEntry(aliases)
  return Boolean(entry?.key || entry?.token)
}

export const fetchQuota = async () => {
  const entry = readProviderAuthEntry(aliases)
  const apiKey = entry?.key ?? entry?.token

  if (!apiKey) {
    return notConfiguredResult({ providerId, providerName })
  }

  try {
    const response = await fetchWithQuotaTimeout("https://api.z.ai/api/monitor/usage/quota/limit", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      discardResponseBody(response)
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      })
    }

    const payload = await response.json()
    // The same monitor API as Zhipu's: a rejected key answers HTTP 200 with `{code, msg, success:false}`,
    // which read as a successful card with no windows and no reason.
    const envelopeError = readEnvelopeError(payload)
    if (envelopeError) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: envelopeError,
      })
    }
    const limits = Array.isArray(payload?.data?.limits) ? payload.data.limits : []
    // The plan's budget entry was renamed to CREDIT_LIMIT.
    const tokensLimit = limits.find((limit) => limit?.type === "TOKENS_LIMIT" || limit?.type === "CREDIT_LIMIT")
    const windowSeconds = resolveWindowSeconds(tokensLimit)
    const windowLabel = resolveWindowLabel(windowSeconds)
    const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null
    const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null

    const windows = {}
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
      })
    }

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
