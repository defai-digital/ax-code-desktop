import { isBashTool, isStandaloneTool, normalizeToolName } from "../../message/parts/toolRenderUtils"
import type { TurnRecord } from "./types"

const EXPLORE_TOOLS = new Set(["read", "list", "ls", "grep", "search", "find", "ripgrep", "glob"])
const RESEARCH_TOOLS = new Set(["webfetch", "websearch", "web_search", "fetch"])

export interface LiveActivitySummary {
  files: number
  additions: number
  deletions: number
  hasDiff: boolean
  explored: boolean
  commands: number
  researched: boolean
  subagents: number
}

/** File totals come from the turn diff. Tool flags only read completed calls. */
export function summarizeLiveActivity(turn: TurnRecord): LiveActivitySummary {
  const diffStats = turn.diffStats
  const summary: LiveActivitySummary = {
    files: diffStats?.files ?? 0,
    additions: diffStats?.additions ?? 0,
    deletions: diffStats?.deletions ?? 0,
    hasDiff: Boolean(diffStats && diffStats.files > 0),
    explored: false,
    commands: 0,
    researched: false,
    subagents: 0,
  }
  const subagents = new Set<string>()
  for (const message of turn.assistantMessages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.state.status !== "completed") continue
      const tool = part.tool
      const name = normalizeToolName(tool)
      if (isBashTool(tool)) summary.commands += 1
      if (EXPLORE_TOOLS.has(name)) summary.explored = true
      if (RESEARCH_TOOLS.has(name)) summary.researched = true
      if (isStandaloneTool(tool)) subagents.add(part.id)
    }
  }
  summary.subagents = subagents.size
  return summary
}
