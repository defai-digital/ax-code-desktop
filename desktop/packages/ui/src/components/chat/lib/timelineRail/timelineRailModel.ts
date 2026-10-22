import type { ChatMessageEntry } from "../turns/types"

export type RailTurn = {
  id: string
  /** Epoch milliseconds the prompt was created, or null when the record has no usable time. */
  created: number | null
  preview: string
}

export type RailTick = { index: number; offset: number }

const PREVIEW_MAX_CHARS = 120
// Bound the scan so a huge pasted prompt costs O(scan), not O(prompt length).
const PREVIEW_SCAN_CHARS = 2048
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g

/**
 * The ticks to draw for a rail with room for `capacity` of them. Turn order, not message length, sets the spacing,
 * so a long reply never stretches the rail. Past capacity the window follows the active turn, and at the bottom it
 * favors the newest turns without excluding the active one.
 */
export function timelineWindow(count: number, capacity: number, active: number, atBottom = false): RailTick[] {
  const room = Math.max(0, Math.floor(capacity))
  if (count < 2 || room < 1) return []
  const size = Math.min(count, room)
  const tail = count - size
  const start = atBottom
    ? Math.max(0, Math.min(active, tail))
    : Math.max(0, Math.min(tail, active - Math.floor(size / 2)))
  return Array.from({ length: size }, (_, offset) => ({ index: start + offset, offset }))
}

/** First non-empty line, whitespace-normalized and capped in code points. */
export function turnPreview(text: string, max = PREVIEW_MAX_CHARS): string {
  const head = text.length > PREVIEW_SCAN_CHARS ? text.slice(0, PREVIEW_SCAN_CHARS) : text
  for (const raw of head.split("\n")) {
    const line = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim()
    if (!line) continue
    const chars = Array.from(line)
    if (chars.length <= max) return line
    return `${chars.slice(0, max - 1).join("")}…`
  }
  return ""
}

function promptText(entry: ChatMessageEntry): string {
  for (const part of entry.parts) {
    const candidate = part as { type?: string; text?: unknown; synthetic?: boolean; ignored?: boolean }
    if (candidate.type === "text" && !candidate.synthetic && !candidate.ignored && typeof candidate.text === "string") {
      return candidate.text
    }
  }
  return ""
}

/**
 * One rail entry per turn id, in turn order. A prompt does not change after it is sent, so its preview is kept in
 * `cache` and only new or still-empty prompts are scanned again: the message list changes on every streamed token.
 */
export function collectRailTurns(
  messages: readonly ChatMessageEntry[],
  turnIds: readonly string[],
  cache: Map<string, string>,
): RailTurn[] {
  if (turnIds.length < 2) return []
  const wanted = new Set(turnIds)
  const prompts = new Map<string, ChatMessageEntry>()
  for (const entry of messages) {
    if (wanted.has(entry.info.id)) prompts.set(entry.info.id, entry)
  }
  const turns: RailTurn[] = []
  for (const id of turnIds) {
    const entry = prompts.get(id)
    if (!entry) continue
    let preview = cache.get(id)
    if (!preview) {
      preview = turnPreview(promptText(entry))
      if (preview) cache.set(id, preview)
    }
    const created = (entry.info as { time?: { created?: unknown } }).time?.created
    turns.push({
      id,
      created: typeof created === "number" && Number.isFinite(created) ? created : null,
      preview: preview ?? "",
    })
  }
  return turns
}
