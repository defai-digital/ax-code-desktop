import type { Agent } from "@defai-digital/ax-code-sdk/v2"
export const isPrimaryMode = (mode?: string) =>
  mode === "primary" || mode === "all" || mode === undefined || mode === null

const getCyclablePrimaryAgents = (agents: Agent[]) => agents.filter((agent) => isPrimaryMode(agent.mode))

export const getCycledPrimaryAgentName = (
  agents: Agent[],
  currentAgentName: string | undefined,
  direction: 1 | -1 = 1,
) => {
  const primaryAgents = getCyclablePrimaryAgents(agents)
  if (primaryAgents.length <= 1) {
    return null
  }

  const currentIndex = primaryAgents.findIndex((agent) => agent.name === currentAgentName)
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = (safeCurrentIndex + direction + primaryAgents.length) % primaryAgents.length
  return primaryAgents[nextIndex]?.name ?? null
}
