/**
 * Zhipu AI Coding Plan quota fetch
 *
 * API: https://open.bigmodel.cn/api/monitor/usage/quota/limit (see zhipu-monitor-shared.js for the response)
 */
import { readConfigLayers } from "../../ax-code/shared.js"
import { notConfiguredResult, readProviderAuthEntry } from "../utils/index.js"

import {
  fetchMonitorQuota,
  findMcpToolsLimit,
  findPlanBudgetLimit,
  toMonitorUsageWindow,
} from "./zhipu-monitor-shared.js"

// TIME_LIMIT (MCP tools) is reported with unit=5, a month; counted as 30 days.
const MCP_TOOLS_WINDOW_SECONDS = 30 * 24 * 60 * 60

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

export const isConfigured = () => {
  return Boolean(getApiKey())
}

export const fetchQuota = async () => {
  const apiKey = getApiKey()

  if (!apiKey) {
    return notConfiguredResult({ providerId, providerName })
  }

  return fetchMonitorQuota({
    providerId,
    providerName,
    url: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
    apiKey,
    buildWindows: (limits) => {
      const windows = {}
      const budget = findPlanBudgetLimit(limits)
      if (budget) {
        windows[budget.type === "CREDIT_LIMIT" ? "Credits" : "Tokens"] = toMonitorUsageWindow(budget)
      }
      const mcpTools = findMcpToolsLimit(limits)
      if (mcpTools) {
        windows["MCP Tools"] = toMonitorUsageWindow(mcpTools, { windowSeconds: MCP_TOOLS_WINDOW_SECONDS })
      }
      return windows
    },
  })
}
