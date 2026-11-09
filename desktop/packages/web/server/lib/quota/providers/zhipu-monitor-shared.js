/**
 * The quota monitor API that Zhipu AI and z.ai both serve, at their own hosts:
 * `GET /api/monitor/usage/quota/limit` with a bearer key.
 *
 * Response limits:
 * - TOKENS_LIMIT / CREDIT_LIMIT: plan budget usage (rolling window)
 * - TIME_LIMIT: MCP tools usage (monthly window)
 *
 * Each provider module keeps what differs (its host, how it finds the key, how it labels the windows); the
 * request, the error envelope and the limit lookups live here so a change to the API is made once.
 *
 * @typedef {Object} MonitorLimit
 * @property {string} type - 'TOKENS_LIMIT' | 'CREDIT_LIMIT' | 'TIME_LIMIT'
 * @property {number} [unit]
 * @property {number} [number]
 * @property {number} [nextResetTime]
 * @property {number} [percentage]
 */
import { buildResult, normalizeTimestamp, resolveWindowSeconds, toUsageWindow } from "../utils/index.js"

import { discardResponseBody, fetchWithQuotaTimeout } from "../fetch.js"

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

/**
 * The plan's budget entry. It was renamed from TOKENS_LIMIT to CREDIT_LIMIT, and matching only the old name
 * left the card with no windows at all.
 *
 * @param {MonitorLimit[]} limits
 */
export const findPlanBudgetLimit = (limits) =>
  limits.find((limit) => limit?.type === "TOKENS_LIMIT" || limit?.type === "CREDIT_LIMIT") ?? null

/** @param {MonitorLimit[]} limits */
export const findMcpToolsLimit = (limits) => limits.find((limit) => limit?.type === "TIME_LIMIT") ?? null

/**
 * A usage window for one limit entry. The window length comes from the entry's unit and number unless the
 * caller knows it (TIME_LIMIT is always a month).
 *
 * @param {MonitorLimit} limit
 * @param {{ windowSeconds?: number | null }} [options]
 */
export const toMonitorUsageWindow = (limit, { windowSeconds = resolveWindowSeconds(limit) } = {}) =>
  toUsageWindow({
    usedPercent: typeof limit?.percentage === "number" ? limit.percentage : null,
    windowSeconds,
    resetAt: limit?.nextResetTime ? normalizeTimestamp(limit.nextResetTime) : null,
  })

/**
 * Fetch the monitor API and build the provider result.
 *
 * @param {{
 *   providerId: string,
 *   providerName: string,
 *   url: string,
 *   apiKey: string,
 *   buildWindows: (limits: MonitorLimit[]) => Record<string, unknown>,
 * }} options
 */
export const fetchMonitorQuota = async ({ providerId, providerName, url, apiKey, buildWindows }) => {
  const failure = (error) => buildResult({ providerId, providerName, ok: false, configured: true, error })

  try {
    const response = await fetchWithQuotaTimeout(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      discardResponseBody(response)
      return failure(`API error: ${response.status}`)
    }

    const payload = await response.json()
    const envelopeError = readEnvelopeError(payload)
    if (envelopeError) {
      return failure(envelopeError)
    }

    const limits = Array.isArray(payload?.data?.limits) ? payload.data.limits : []
    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows: buildWindows(limits) },
    })
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Request failed")
  }
}
