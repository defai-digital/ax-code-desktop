import { isPlainRecord } from "./record"

const getTime = (part: unknown, field: "start" | "end"): number | undefined => {
  if (!isPlainRecord(part)) return undefined
  const state = isPlainRecord(part.state) ? part.state : undefined
  const stateTime = isPlainRecord(state?.time) ? state.time : undefined
  const nested = stateTime?.[field]
  if (typeof nested === "number") return nested
  const time = isPlainRecord(part.time) ? part.time : undefined
  const fallback = time?.[field]
  return typeof fallback === "number" ? fallback : undefined
}

export const getMessagePartEndTime = (part: unknown): number | undefined => getTime(part, "end")
export const getMessagePartStartTime = (part: unknown): number | undefined => getTime(part, "start")

export const getValidMessagePartEndTime = (part: unknown): number | undefined => {
  const end = getMessagePartEndTime(part)
  if (end === undefined) return undefined
  const start = getMessagePartStartTime(part)
  if (start !== undefined && end < start) return undefined
  return end
}

export const getMessagePartText = (part: unknown): string | undefined => {
  if (!isPlainRecord(part)) return undefined
  if (typeof part.text === "string" && part.text.trim().length > 0) return part.text
  if (typeof part.content === "string" && part.content.trim().length > 0) return part.content
  return undefined
}
