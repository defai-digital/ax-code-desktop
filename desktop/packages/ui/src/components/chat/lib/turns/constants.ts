export const ACTIVITY_STANDALONE_TOOL_NAMES = new Set<string>(["task"])
export const TURN_WINDOW_DEFAULTS = {
  initialTurns: 7,
  batchTurns: 7,
  prefetchBuffer: 16,
} as const
