import { toast } from "@/components/ui"
import { copyTextToClipboard } from "@/lib/clipboard"
import type { useI18n } from "@/lib/i18n"

const SESSION_ID_TAIL_LENGTH = 8

/**
 * Compact label for a session id. Ascending ids share a long time-ordered
 * prefix, so the distinguishing random tail is what stays visible.
 */
export function shortSessionId(sessionId: string): string {
  const trimmed = sessionId.trim()
  const separator = trimmed.indexOf("_")
  const prefix = separator > 0 ? trimmed.slice(0, separator + 1) : ""
  const body = trimmed.slice(prefix.length)
  if (body.length <= SESSION_ID_TAIL_LENGTH + 1) {
    return trimmed
  }
  return `${prefix}…${body.slice(-SESSION_ID_TAIL_LENGTH)}`
}

export async function copySessionId(sessionId: string, t: ReturnType<typeof useI18n>["t"]): Promise<boolean> {
  const result = await copyTextToClipboard(sessionId)
  if (result.ok) {
    toast.success(t("sessions.id.copied"))
    return true
  }
  toast.error(t("sessions.id.copyFailed"))
  return false
}
