import { webMcpDisplayText } from "../../../../shared/webmcp-redaction.mjs"
import { webMcpDefinitionForDigest, type WebMcpToolDefinition } from "./webMcpCatalog"
import {
  describeWebMcpCall,
  desktopWebMcpResultFailed,
  desktopWebMcpRowTitle,
  isWebMcpToolName,
  readWebMcpDefinitionDigest,
  readWebMcpInvokeInput,
  webMcpResultPreview,
  type WebMcpFailureReason,
  type WebMcpInvokeInputKind,
} from "./toolHelpers"
import { truncateToCodeUnits } from "./textTruncate"

/** One page-tool call the agent made through the project browser, as the transcript records it. */
export interface WebMcpCall {
  id: string
  title: string
  /** The page tool's name for an invoke; null for other operations. */
  toolName: string | null
  /** Opaque main-issued identity; missing bindings never match by display label. */
  invocationID?: string
  operation: string | null
  argumentsText: string | null
  outcome: "running" | "ok" | "failed" | "checkpointed" | "cancelled"
  failureReason: WebMcpFailureReason | null
  at: number | null
  /** The transcript message holding the call, so a row can open it. */
  messageId: string
  /** The tool part's own id, so a row can open the exact call; null when the part has none. */
  partId: string | null
  /** The runtime's call id, which a pending approval names (`permission.tool.callID`). */
  callId: string | null
  /** Milliseconds from start to end, when both are known. */
  durationMs: number | null
  /** A short, credential-filtered preview of what a completed call returned. */
  resultPreview: string | null
  /** The page document generation the call ran on (from the runtime metadata), to mark calls on an earlier page. */
  generation: string | null
  /** True when an invoke carried neither an arguments object nor an ADR-266 input preview. */
  argumentsMissing: boolean
  /** Definition digest the runtime says this call ran against. Null when the runtime did not send one. */
  definitionDigest: string | null
  /** Where the structured input came from. `missing` means the runtime gave no arguments to check. */
  inputKind: WebMcpInvokeInputKind
  /** Redacted arguments when they form a JSON object. Never taken from the model's own payload. */
  input: Record<string, unknown> | null
}

/** The result a page tool returned, without the runtime's untrusted envelope, as a short filtered line. */
function resultLine(output: unknown): string | null {
  let value = output
  if (typeof output === "string") {
    try {
      value = JSON.parse(output)
    } catch {
      value = output
    }
  }
  // Unwrap only the runtime's untrusted envelope; a tool's own `result` field stays part of what it returned.
  const envelope = value as { untrusted?: unknown; result?: unknown } | null
  const inner = envelope && typeof envelope === "object" && envelope.untrusted === true && "result" in envelope ? envelope.result : value
  const preview = webMcpResultPreview(inner).replace(/\s+/g, " ").trim()
  return preview ? truncateToCodeUnits(preview, 140) : null
}

type PartLike = {
  id?: unknown
  type?: unknown
  tool?: unknown
  callID?: unknown
  state?: {
    status?: unknown
    input?: unknown
    metadata?: unknown
    output?: unknown
    time?: { start?: unknown; end?: unknown }
  }
}
type MessageLike = { id?: unknown; role?: unknown; info?: { role?: unknown } }

/** Default scan window for the recent-call strip. Landing evidence explicitly scans the whole turn. */
export const WEBMCP_CALL_SCAN_MESSAGES = 60

/** The message role, wherever the message shape keeps it. */
export const messageRole = (message: MessageLike | undefined): string | null => {
  const role = message?.role ?? message?.info?.role
  return typeof role === "string" ? role : null
}

/** Messages of the latest turn: from the person's last message on, within the requested scan window (Infinity covers the whole turn). */
export function latestTurnMessages<T extends MessageLike>(messages: readonly T[], scanMessages = WEBMCP_CALL_SCAN_MESSAGES): readonly T[] {
  const floor = Math.max(0, messages.length - scanMessages)
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
  scanMessages = WEBMCP_CALL_SCAN_MESSAGES,
  definitions: readonly WebMcpToolDefinition[] = [],
): WebMcpCall[] {
  const calls: WebMcpCall[] = []
  const floor = Math.max(0, messages.length - scanMessages)
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
      const definitionDigest = readWebMcpDefinitionDigest(metadata)
      const definition = webMcpDefinitionForDigest(definitions, definitionDigest)
      // Runtime names are never used for joins or retained in the UI call projection.
      const safeName = (value: unknown) => typeof value === "string" ? webMcpDisplayText(value) : value
      const safeInput = input ? { ...input, toolName: definition?.name ?? safeName(input.toolName), tool: safeName(input.tool) } : input
      const safeMetadata = metadata ? { ...metadata, toolName: definition?.name ?? safeName(metadata.toolName) } : metadata
      const call = describeWebMcpCall(safeInput, safeMetadata)
      const invoke = call.operation?.toLowerCase() === "invoke" ? readWebMcpInvokeInput(metadata) : null
      const status = typeof state.status === "string" ? state.status : ""
      const failed = desktopWebMcpResultFailed({ status, output: state.output })
      calls.push({
        id: typeof part.id === "string" ? part.id : `${messageId}:${p}`,
        title: desktopWebMcpRowTitle(safeInput, safeMetadata) ?? part.tool,
        toolName: call.toolName,
        invocationID: definition?.invocationID,
        operation: call.operation,
        argumentsText: call.argumentsText,
        outcome: status === "checkpointed"
          ? "checkpointed"
          : /^(cancelled|canceled|aborted)$/.test(status)
            ? "cancelled"
            : failed
              ? "failed"
              : status === "completed" ? "ok" : "running",
        failureReason: call.failureReason,
        at: typeof state.time?.start === "number" ? state.time.start : null,
        messageId,
        partId: typeof part.id === "string" ? part.id : null,
        callId: typeof part.callID === "string" ? part.callID : null,
        durationMs:
          typeof state.time?.start === "number" && typeof state.time?.end === "number"
            ? Math.max(0, state.time.end - state.time.start)
            : null,
        resultPreview: status === "completed" ? resultLine(state.output) : null,
        generation: typeof metadata?.generation === "string" ? metadata.generation : null,
        argumentsMissing: call.argumentsMissing,
        definitionDigest,
        inputKind: invoke?.kind ?? "missing",
        input: invoke?.input ?? null,
      })
    }
  }
  return calls
}

/** "320 ms", "1.4 s", "2 min": enough to see a slow call at a glance. */
export function formatWebMcpDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  return `${Math.round(ms / 60_000)} min`
}

/** Reuse translated terminal-state labels rather than inventing English fallbacks. */
export function webMcpCallOutcomeKey(outcome: WebMcpCall["outcome"]) {
  if (outcome === "cancelled") return "chat.todo.cancelled" as const
  if (outcome === "checkpointed") return "supervision.goal.status.paused" as const
  return `webmcp.calls.outcome.${outcome}` as const
}
