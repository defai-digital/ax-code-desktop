import { isWebMcpToolName } from "@/lib/toolHelpers"
import { latestTurnMessages } from "@/lib/webMcpCalls"

/**
 * callID, status, and output identity for each webmcp part in the latest turn.
 * Text parts and other tools are omitted. Output is compared with `===`: object
 * outputs by reference, string outputs by value, so a text token does not look
 * like a new tool result.
 */
export type WebMcpRecapFingerprint = ReadonlyArray<readonly [callID: unknown, status: unknown, output: unknown]>

type WebMcpRecapPart = {
  type?: unknown
  tool?: unknown
  callID?: unknown
  state?: { status?: unknown; output?: unknown } | null
}

const webMcpRecapPart = (value: unknown): WebMcpRecapPart | null => {
  if (!value || typeof value !== "object") return null
  const part = value as WebMcpRecapPart
  if (part.type !== "tool" || typeof part.tool !== "string" || !isWebMcpToolName(part.tool)) return null
  return part
}

/** Fingerprint of the webmcp calls the landing recap would read. Order is turn order. */
export function fingerprintWebMcpRecap(
  messages: readonly { id?: unknown; role?: unknown; info?: { role?: unknown } }[],
  partsOf: (messageId: string) => readonly unknown[] | undefined,
): WebMcpRecapFingerprint {
  const entries: Array<readonly [unknown, unknown, unknown]> = []
  for (const message of latestTurnMessages(messages, Infinity)) {
    const messageId = message.id
    if (typeof messageId !== "string") continue
    const parts = partsOf(messageId)
    if (!parts) continue
    for (const value of parts) {
      const part = webMcpRecapPart(value)
      if (!part) continue
      entries.push([part.callID, part.state?.status, part.state?.output])
    }
  }
  return entries
}

export function sameWebMcpRecapFingerprint(
  left: WebMcpRecapFingerprint,
  right: WebMcpRecapFingerprint,
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (!a || !b || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) return false
  }
  return true
}
