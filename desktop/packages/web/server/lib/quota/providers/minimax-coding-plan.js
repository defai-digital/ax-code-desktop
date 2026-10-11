import { createMinimaxProvider } from "./minimax-shared.js"

export const { providerId, providerName, aliases, isConfigured, fetchQuota } = createMinimaxProvider({
  providerId: "minimax-coding-plan",
  providerName: "MiniMax Token Plan",
  endpoint: "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
})
