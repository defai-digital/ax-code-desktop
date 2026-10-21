import {
  describeWebMcpCall,
  desktopWebMcpResultFailed,
  desktopWebMcpRowTitle,
  isWebMcpToolName,
  type WebMcpFailureReason,
} from "./toolHelpers"

/** One page-tool call the agent made through the project browser, as the transcript records it. */
export interface WebMcpCall {
  id: string
  title: string
  /** The page tool's name for an invoke; null for other operations. */
  toolName: string | null
  operation: string | null
  argumentsText: string | null
  outcome: "running" | "ok" | "failed"
  failureReason: WebMcpFailureReason | null
  at: number | null
}

type PartLike = {
  id?: unknown
  type?: unknown
  tool?: unknown
  state?: { status?: unknown; input?: unknown; metadata?: unknown; output?: unknown; time?: { start?: unknown } }
}
type MessageLike = { id?: unknown; role?: unknown; info?: { role?: unknown } }

/** How far back the strip and the landing evidence look, so a long session is never rescanned in full. */
export const WEBMCP_CALL_SCAN_MESSAGES = 60

/** The message role, wherever the message shape keeps it. */
export const messageRole = (message: MessageLike | undefined): string | null => {
  const role = message?.role ?? message?.info?.role
  return typeof role === "string" ? role : null
}

/** Messages of the latest turn: from the person's last message on, within the scan window. */
export function latestTurnMessages<T extends MessageLike>(messages: readonly T[]): readonly T[] {
  const floor = Math.max(0, messages.length - WEBMCP_CALL_SCAN_MESSAGES)
  for (let index = messages.length - 1; index >= floor; index -= 1) {
    if (messageRole(messages[index]) === "user") return messages.slice(index)
  }
  return messages.slice(floor)
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

/**
 * The session's most recent WebMCP calls, newest first, from transcript parts Desktop already holds. Arguments are the same
 * redacted description the transcript shows; nothing is fetched and nothing is stored.
 */
export function collectWebMcpCalls(
  messages: readonly MessageLike[],
  partsOf: (messageId: string) => readonly PartLike[] | undefined,
  limit = 20,
): WebMcpCall[] {
  const calls: WebMcpCall[] = []
  const floor = Math.max(0, messages.length - WEBMCP_CALL_SCAN_MESSAGES)
  for (let m = messages.length - 1; m >= floor && calls.length < limit; m -= 1) {
    const messageId = messages[m]?.id
    if (typeof messageId !== "string") continue
    const parts = partsOf(messageId) ?? []
    for (let p = parts.length - 1; p >= 0 && calls.length < limit; p -= 1) {
      const part = parts[p]
      if (part?.type !== "tool" || typeof part.tool !== "string" || !isWebMcpToolName(part.tool)) continue
      const state = part.state ?? {}
      const input = record(state.input)
      const metadata = record(state.metadata)
      const call = describeWebMcpCall(input, metadata)
      const status = typeof state.status === "string" ? state.status : ""
      const failed = desktopWebMcpResultFailed({ status, output: state.output })
      calls.push({
        id: typeof part.id === "string" ? part.id : `${messageId}:${p}`,
        title: desktopWebMcpRowTitle(input, metadata) ?? part.tool,
        toolName: call.toolName,
        operation: call.operation,
        argumentsText: call.argumentsText,
        outcome: failed ? "failed" : status === "completed" ? "ok" : "running",
        failureReason: call.failureReason,
        at: typeof state.time?.start === "number" ? state.time.start : null,
      })
    }
  }
  return calls
}
