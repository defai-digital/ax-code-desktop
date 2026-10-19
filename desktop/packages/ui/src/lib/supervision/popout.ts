import { canUseLocalElectronDesktopIPC, invokeDesktop } from "@/lib/desktop"

import type { OpenSessionTarget } from "./openSession"

/**
 * Supervision pop-out (SPEC-2026-10-19-supervision-popout-v1): Mission Control in its own Electron window.
 * The pop-out is a view; opening a session hands it to the main window through the existing
 * `desktop_focus_main_window` hand-off, which recreates the main window when it was closed.
 */

/** Only the local Electron shell can open a second renderer window. */
export function canOpenSupervisionPopout(): boolean {
  return canUseLocalElectronDesktopIPC()
}

/** Open the pop-out, or focus it when it is already open. Resolves to whether the shell accepted it. */
export async function openSupervisionPopout(): Promise<boolean> {
  try {
    await invokeDesktop("desktop_open_supervision_window")
    return true
  } catch (error) {
    console.warn("[supervision] failed to open the supervision window", error)
    return false
  }
}

/** Show a session in the main window. Resolves to whether the main window took the hand-off. */
export async function openSessionInMainWindow(target: OpenSessionTarget): Promise<boolean> {
  if (!target.sessionId) return false
  try {
    const result = await invokeDesktop<{ focused?: boolean }>("desktop_focus_main_window", {
      sessionId: target.sessionId,
      directory: target.directory ?? "",
    })
    return result?.focused === true
  } catch (error) {
    console.warn("[supervision] failed to hand the session to the main window", error)
    return false
  }
}

/** Open a new-session draft in the main window. */
export async function openDraftInMainWindow(): Promise<boolean> {
  try {
    const result = await invokeDesktop<{ focused?: boolean }>("desktop_focus_main_window", {
      mode: "draft",
      directory: "",
      projectId: null,
    })
    return result?.focused === true
  } catch (error) {
    console.warn("[supervision] failed to open a draft in the main window", error)
    return false
  }
}

export const SUPERVISION_POPOUT_PALETTE_ID = "supervision:pop-out"

/** The command-palette entry for the pop-out, or null where no pop-out window can open. */
export function supervisionPopoutPaletteEntry(
  title: string,
  available: boolean = canOpenSupervisionPopout(),
): { id: string; title: string; searchText: string; onSelect: () => Promise<boolean> } | null {
  if (!available) return null
  return {
    id: SUPERVISION_POPOUT_PALETTE_ID,
    title,
    searchText: `${title} supervision mission control board window pop out detach`,
    onSelect: openSupervisionPopout,
  }
}
