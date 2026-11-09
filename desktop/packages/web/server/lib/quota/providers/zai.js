import { notConfiguredResult, readProviderAuthEntry, resolveWindowLabel, resolveWindowSeconds } from "../utils/index.js"

import { fetchMonitorQuota, findPlanBudgetLimit, toMonitorUsageWindow } from "./zhipu-monitor-shared.js"

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

  return fetchMonitorQuota({
    providerId,
    providerName,
    url: "https://api.z.ai/api/monitor/usage/quota/limit",
    apiKey,
    // z.ai labels the budget window by its length ("5h"); Zhipu's card has always said "Tokens"/"Credits".
    buildWindows: (limits) => {
      const budget = findPlanBudgetLimit(limits)
      if (!budget) return {}
      return { [resolveWindowLabel(resolveWindowSeconds(budget))]: toMonitorUsageWindow(budget) }
    },
  })
}
