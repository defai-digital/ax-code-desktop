import { normalizeProjectPath } from "@/lib/projectResolution"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"

const BESIDE_WIDTH_SHARE = 0.5

/**
 * Shows another session in the context panel beside the current chat, with its own composer, so two sessions can be
 * supervised in one window. The pane is kept per directory, so the tab goes into the panel of the project the chat is
 * showing and remembers the session's own directory. Returns false when there is no project to show it in.
 */
export function openSessionBeside(target: { sessionId: string; directory: string | null; title: string }): boolean {
  const sessionDirectory = target.directory?.trim() || null
  const panelDirectory = useDirectoryStore.getState().currentDirectory || sessionDirectory
  if (!target.sessionId || !panelDirectory) return false
  useUIStore.getState().openContextPanelTab(panelDirectory, {
    mode: "chat",
    dedupeKey: `session:${target.sessionId}`,
    label: target.title,
    targetPath: sessionDirectory,
  })
  // Two sessions need room to be compared, so a narrow panel grows to about half the window. A wider panel the user
  // dragged stays as it is; the panel itself still keeps the chat's minimum width.
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth
  const besideWidth = Math.round(viewportWidth * BESIDE_WIDTH_SHARE)
  const panelKey = normalizeProjectPath(panelDirectory) ?? panelDirectory
  const currentWidth = useUIStore.getState().contextPanelByDirectory?.[panelKey]?.width ?? 0
  if (besideWidth > currentWidth) useUIStore.getState().setContextPanelWidth(panelDirectory, besideWidth)
  // The context panel sits beside the chat itself; the chat must be the visible main view for it to show.
  const ui = useUIStore.getState()
  if (ui.activeMainTab !== "chat") useUIStore.setState({ activeMainTab: "chat" })
  return true
}
