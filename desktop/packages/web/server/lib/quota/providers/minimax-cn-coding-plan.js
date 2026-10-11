// MiniMax Token Plan Provider (China, minimaxi.com)
import { createMinimaxProvider } from "./minimax-shared.js"

export const { providerId, providerName, aliases, isConfigured, fetchQuota } = createMinimaxProvider({
  providerId: "minimax-cn-coding-plan",
  providerName: "MiniMax Token Plan (China)",
  endpoint: "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
})
