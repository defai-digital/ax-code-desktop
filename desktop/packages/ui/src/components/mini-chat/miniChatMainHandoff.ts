type MiniChatMainHandoffPayload =
  | {
      sessionId: string
      directory: string
    }
  | {
      mode: "draft"
      directory: string
      projectId: string | null
    }

const firstNonEmpty = (...values: Array<string | null | undefined>): string => {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : ""
    if (trimmed) return trimmed
  }
  return ""
}

export function buildMiniChatMainHandoffPayload(input: {
  currentSessionId?: string | null
  openDirectory?: string | null
  sessionDirectory?: string | null
  currentDirectory?: string | null
  draftProjectId?: string | null
}): MiniChatMainHandoffPayload {
  const sessionId = firstNonEmpty(input.currentSessionId)
  if (sessionId) {
    return {
      sessionId,
      directory: firstNonEmpty(input.openDirectory, input.sessionDirectory, input.currentDirectory),
    }
  }

  return {
    mode: "draft",
    directory: firstNonEmpty(input.openDirectory, input.currentDirectory),
    projectId: firstNonEmpty(input.draftProjectId) || null,
  }
}

type DesktopInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/**
 * Hand this mini-chat's session to the main window and close the mini-chat once the hand-off
 * was accepted. Resolves to whether the main window took over.
 *
 * `desktop_focus_main_window` refuses a non-local sender or a non-main frame, and answers
 * {focused:false} when it could not reveal a window, so a failed hand-off has to leave the
 * mini-chat open — the fallback the command documents. The rejection used to escape the click
 * handler as an unhandled one while the click itself did nothing at all.
 */
export async function focusMainWindowOrKeepOpen(
  invoke: DesktopInvoke,
  payload: MiniChatMainHandoffPayload,
): Promise<boolean> {
  try {
    const result = await invoke("desktop_focus_main_window", payload as Record<string, unknown>)
    if ((result as { focused?: boolean } | null)?.focused !== true) {
      return false
    }
    await invoke("desktop_close_current_window").catch(() => {})
    return true
  } catch {
    return false
  }
}
