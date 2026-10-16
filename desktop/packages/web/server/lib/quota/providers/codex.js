import {
  notConfiguredResult,
  readProviderAuthEntry,
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  formatMoney,
} from "../utils/index.js"

import { fetchWithQuotaTimeout } from "../fetch.js"

export const providerId = "codex"
export const providerName = "Codex"
export const aliases = ["openai", "codex", "chatgpt"]
const MONETARY_QUOTA_LABELS_ENABLED = false

export const isConfigured = () => {
  const entry = readProviderAuthEntry(aliases)
  return Boolean(entry?.access || entry?.token)
}

export const fetchQuota = async () => {
  const entry = readProviderAuthEntry(aliases)
  const accessToken = entry?.access ?? entry?.token
  const accountId = entry?.accountId

  if (!accessToken) {
    return notConfiguredResult({ providerId, providerName })
  }

  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    }
    const response = await fetchWithQuotaTimeout("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers,
    })

    if (!response.ok) {
      // A 401 is not always an expired token: the endpoint answers an access-enforcement body
      // (`rejected_by_access_enforcement`) for a sign-in method it refuses while the credential is
      // fine, and calling that an expired session sends the user to re-authenticate for nothing.
      if (response.status === 401) {
        const body = await response.json().catch(() => null)
        if (body?.error?.type === "rejected_by_access_enforcement") {
          return buildResult({
            providerId,
            providerName,
            ok: false,
            configured: true,
            error: "Usage is not available for this OpenAI sign-in method; chat still works",
          })
        }
      }
      response.body?.cancel()
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error:
          response.status === 401
            ? "Session expired \u2014 please re-authenticate with OpenAI"
            : `API error: ${response.status}`,
      })
    }

    const payload = await response.json()
    const primary = payload?.rate_limit?.primary_window ?? null
    const secondary = payload?.rate_limit?.secondary_window ?? null
    const credits = payload?.credits ?? null

    const windows = {}
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(primary.used_percent),
        windowSeconds: toNumber(primary.limit_window_seconds),
        resetAt: toTimestamp(primary.reset_at),
      })
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: toNumber(secondary.used_percent),
        windowSeconds: toNumber(secondary.limit_window_seconds),
        resetAt: toTimestamp(secondary.reset_at),
      })
    }
    if (credits) {
      const balance = toNumber(credits.balance)
      const unlimited = Boolean(credits.unlimited)
      const formattedBalance = MONETARY_QUOTA_LABELS_ENABLED && balance !== null ? formatMoney(balance) : null
      const label = unlimited ? "Unlimited" : formattedBalance ? `$${formattedBalance} remaining` : null
      windows.credits = toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: label,
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
