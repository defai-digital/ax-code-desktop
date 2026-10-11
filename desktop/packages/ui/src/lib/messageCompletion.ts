import type { Part } from "@defai-digital/ax-code-sdk/v2"
import { isFullySyntheticMessage } from "@/lib/messages/synthetic"
import { isRecord } from "@/lib/record"

export interface MessageInfo {
  id: string
  role: string
  time?: {
    created?: number
    completed?: number
  }
  status?: string
  streaming?: boolean
  finish?: string
}

export interface MessageRecord {
  info: MessageInfo & Record<string, unknown>
  parts: Part[]
}

const getRecordField = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined)

export function isMessageComplete(messageInfo: MessageInfo, parts: Part[] = []): boolean {
  if (isFullySyntheticMessage(parts)) {
    return true
  }

  const timeInfo = messageInfo?.time ?? {}
  const completedAt = typeof timeInfo?.completed === "number" ? timeInfo.completed : undefined
  const messageStatus = messageInfo?.status

  const hasStopFinish = messageInfo.finish === "stop"

  const hasCompletedFlag = (typeof completedAt === "number" && completedAt > 0) || messageStatus === "completed"
  if (!hasCompletedFlag || !hasStopFinish) {
    return false
  }

  const hasActiveTools = parts.some((part) => {
    switch (part.type) {
      case "reasoning": {
        const time = getRecordField(part, "time")
        return !isRecord(time) || typeof time.end === "undefined"
      }
      case "tool": {
        const state = getRecordField(part, "state")
        const status = getRecordField(state, "status")
        return status === "running" || status === "pending"
      }
      default:
        return false
    }
  })

  return !hasActiveTools
}
