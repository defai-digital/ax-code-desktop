import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"

// A crashed CLI can leave an active tool persisted forever. Limit inferred activity to 30 minutes.
export const EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS = 30 * 60 * 1000

const ACTIVE_TOOL_STATUSES = new Set(["pending", "running", "started"])
// The SDK exposes finish as a string. Tool calls and unknown finishes may continue the turn.
const TERMINAL_FINISHES = new Set(["stop", "error", "aborted", "length", "content-filter", "content_filter"])

interface ExternalSessionActivityInput {
  updated: number | undefined
  now: number
  messages: readonly Message[]
  parts: readonly Part[]
}

export function inferExternalSessionActivity(input: ExternalSessionActivityInput): "running" | "idle" {
  if (typeof input.updated !== "number" || input.now - input.updated > EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS) {
    return "idle"
  }
  const newest = [...input.messages].sort(
    (left, right) => right.time.created - left.time.created || right.id.localeCompare(left.id),
  )[0]
  if (!newest) return "idle"
  if (newest.role === "user") return "running"
  if (input.parts.some((part) => part.type === "tool" && ACTIVE_TOOL_STATUSES.has(part.state.status))) {
    return "running"
  }
  if (typeof newest.time.completed === "number" || TERMINAL_FINISHES.has(newest.finish ?? "")) return "idle"
  return "running"
}
