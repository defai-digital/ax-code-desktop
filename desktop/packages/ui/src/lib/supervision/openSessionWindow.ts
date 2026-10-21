import { toast } from "@/components/ui"
import { canUseLocalElectronDesktopIPC, invokeDesktop } from "@/lib/desktop"

/** Whether this shell can open a session in its own window (the local Electron app only). */
export function canOpenSessionWindow(): boolean {
  return canUseLocalElectronDesktopIPC()
}

/**
 * Opens a session in its own window so two sessions can be watched side by side: the window keeps one session while the
 * main window moves on to another. Resolves false where the shell has no window support or the request fails.
 */
export async function openSessionWindow(
  target: { sessionId: string; directory: string | null },
  failureMessage: string,
): Promise<boolean> {
  if (!target.sessionId || !canOpenSessionWindow()) return false
  try {
    await invokeDesktop("desktop_open_session_mini_chat_window", {
      sessionId: target.sessionId,
      directory: target.directory,
    })
    return true
  } catch (error) {
    console.warn("[supervision] failed to open the session window", error)
    toast.error(failureMessage)
    return false
  }
}
