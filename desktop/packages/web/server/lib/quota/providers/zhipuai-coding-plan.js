/**
 * Zhipu AI Coding Plan quota fetch
 *
 * API: https://open.bigmodel.cn/api/monitor/usage/quota/limit
 *
 * Response limits:
 * - TOKENS_LIMIT / CREDIT_LIMIT: plan budget usage (rolling window)
 * - TIME_LIMIT: MCP tools usage (monthly window)
 *
 * @typedef {Object} TokensLimit
 * @property {string} type - 'TOKENS_LIMIT'
 * @property {number} [unit]
 * @property {number} [number]
 * @property {number} [nextResetTime]
 * @property {number} [percentage]
 *
 * @typedef {Object} McpToolsTimeLimit
 * @property {string} type - 'TIME_LIMIT'
 * @property {number} [unit]
 * @property {number} [number]
 * @property {number} [usage]
 * @property {number} [currentValue]
 * @property {number} [remaining]
 * @property {number} [percentage]
 * @property {number} [nextResetTime]
 * @property {Array<{modelCode: string, usage: number}>} [usageDetails]
 */
import { readConfigLayers } from "../../ax-code/shared.js"
import {
  notConfiguredResult,
  readProviderAuthEntry,
  buildResult,
  toUsageWindow,
  resolveWindowSeconds,
  normalizeTimestamp,
} from "../utils/index.js"

import { fetchWithQuotaTimeout } from "../fetch.js"

export const providerId = "zhipuai-coding-plan"
export const providerName = "Zhipu AI Coding Plan"
export const aliases = ["zhipuai-coding-plan", "zhipuai", "zhipu"]

function getApiKey() {
  const entry = readProviderAuthEntry(aliases)
  const apiKeyFromAuth = entry?.key ?? entry?.token

  if (apiKeyFromAuth) {
    return apiKeyFromAuth
  }

  try {
    const { mergedConfig } = readConfigLayers()

    for (const alias of aliases) {
      const providerConfig = mergedConfig?.provider?.[alias]
      if (providerConfig?.options?.apiKey) {
        return providerConfig.options.apiKey
      }
    }
  } catch {
    // Ignore config read errors; the provider will be treated as not configured.
  }

  return null
}

/**
 * The business failure the monitor API reports inside an HTTP 200 body, if any.
 *
 * It answers `{code, msg, success:false}` for a rejected key, which used to read as a successful
 * empty card: the panel showed no windows and no reason.
 */
export const readEnvelopeError = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null
  }
  const code = typeof payload.code === "number" ? payload.code : null
  const failed = payload.success === false || (code !== null && code !== 200)
  if (!failed) {
    return null
  }
  const message = typeof payload.msg === "string" ? payload.msg.trim() : ""
  return message || `Usage request failed${code !== null ? ` (${code})` : ""}`
}

export const isConfigured = () => {
  return Boolean(getApiKey())
}

export const fetchQuota = async () => {
  const apiKey = getApiKey()

  if (!apiKey) {
    return notConfiguredResult({ providerId, providerName })
  }

  try {
    const response = await fetchWithQuotaTimeout("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
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

    // The coding plan reports its budget as CREDIT_LIMIT (the token entry was renamed), so
    // matching only TOKENS_LIMIT left the card with no windows at all.
    const tokensLimit = limits.find(
      (limit) => limit?.type === "TOKENS_LIMIT" || limit?.type === "CREDIT_LIMIT",
    )
    const mcpToolsTimeLimit = limits.find((limit) => limit?.type === "TIME_LIMIT")

    const windows = {}

    // Handle TOKENS_LIMIT / CREDIT_LIMIT (rolling window for the plan's budget)
    if (tokensLimit) {
      const windowSeconds = resolveWindowSeconds(tokensLimit)
      const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null
      const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null

      windows[tokensLimit?.type === "CREDIT_LIMIT" ? "Credits" : "Tokens"] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
      })
    }

    // Handle TIME_LIMIT (MCP tools monthly window)
    if (mcpToolsTimeLimit) {
      // TIME_LIMIT unit=5 means 1 month (30 days)
      const monthSeconds = 30 * 24 * 60 * 60
      const resetAt = mcpToolsTimeLimit?.nextResetTime ? normalizeTimestamp(mcpToolsTimeLimit.nextResetTime) : null
      const usedPercent = typeof mcpToolsTimeLimit?.percentage === "number" ? mcpToolsTimeLimit.percentage : null

      windows["MCP Tools"] = toUsageWindow({
        usedPercent,
        windowSeconds: monthSeconds,
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
