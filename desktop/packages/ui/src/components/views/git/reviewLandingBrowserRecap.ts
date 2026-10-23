import { isWebMcpToolName } from "@/lib/toolHelpers"
import { latestTurnMessages } from "@/lib/webMcpCalls"

/**
 * Message id and part object of each webmcp part in the latest turn. Text parts and other tools are
 * omitted. The reducer replaces a part object on every update, so reference equality covers every
 * field the recap reads (input, metadata, timing, error) without listing them, while a text token
 * leaves these parts untouched.
 */
export type WebMcpRecapFingerprint = ReadonlyArray<readonly [messageId: string, part: unknown]>

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
  const entries: Array<readonly [string, unknown]> = []
  for (const message of latestTurnMessages(messages, Infinity)) {
    const messageId = message.id
    if (typeof messageId !== "string") continue
    const parts = partsOf(messageId)
    if (!parts) continue
    for (const value of parts) {
      const part = webMcpRecapPart(value)
      if (!part) continue
      entries.push([messageId, value])
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
    if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) return false
  }
  return true
}
