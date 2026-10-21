import type { MainTab } from "@/stores/useUIStore"
import { useUIStore } from "@/stores/useUIStore"

export type BesideChatView = Exclude<MainTab, "chat" | "session-grid">

/**
 * The Files editor guards unsaved changes through the main-tab guard. Beside the chat it lives in the split
 * pane, so replacing or closing that pane is what would discard it: ask the guard first. A refusal opens the
 * editor's own discard dialog, which re-requests the view once the user decides.
 */
const mayLeaveFilesPane = (next: MainTab): boolean => {
  const ui = useUIStore.getState()
  const showingFiles = ui.splitPaneEnabled && ui.splitPaneRightTab === "files"
  if (!showingFiles || next === "files" || !ui.mainTabGuard) return true
  return ui.mainTabGuard(next)
}

/**
 * Open a secondary view without covering the chat: changes, files, git, plan and context open in the split
 * pane beside the chat; the terminal opens in the bottom dock so only one terminal view is ever mounted.
 * On mobile there is no room beside the chat, so the full-cover tab is used instead.
 * Returns false when an unsaved Files editor kept its place.
 */
export function openBesideChat(view: BesideChatView): boolean {
  const ui = useUIStore.getState()
  if (ui.isMobile) {
    ui.setActiveMainTab(view)
    return useUIStore.getState().activeMainTab === view
  }
  // On desktop the main tab is only a request to show a view; the chat itself never leaves. Resetting it does
  // not unmount anything, so it does not go through the guard.
  if (ui.activeMainTab !== "chat") useUIStore.setState({ activeMainTab: "chat" })
  if (view === "terminal") {
    ui.setBottomTerminalOpen(true)
    return true
  }
  if (!mayLeaveFilesPane(view)) return false
  ui.setSplitPaneRightTab(view)
  ui.setSplitPaneEnabled(true)
  return true
}

/** Close the view beside the chat, unless an unsaved Files editor keeps it open. */
export function closeBesideChat(view: BesideChatView): boolean {
  const ui = useUIStore.getState()
  if (view === "terminal") {
    ui.setBottomTerminalOpen(false)
    return true
  }
  if (!mayLeaveFilesPane("chat")) return false
  ui.setSplitPaneEnabled(false)
  return true
}

/** Switch the split pane's own tab, unless an unsaved Files editor keeps its place. */
export function selectSplitPaneTab(view: BesideChatView): boolean {
  if (!mayLeaveFilesPane(view)) return false
  useUIStore.getState().setSplitPaneRightTab(view)
  return true
}

/**
 * The Files editor's discard or save dialog finished and released its guard: carry out what it was asked.
 * On desktop a request for "chat" while Files is beside the chat came from closing that pane.
 */
export function continueAfterFilesGuard(next: MainTab): void {
  const ui = useUIStore.getState()
  const showingFiles = ui.splitPaneEnabled && ui.splitPaneRightTab === "files"
  if (!ui.isMobile && next === "chat" && showingFiles) {
    ui.setSplitPaneEnabled(false)
    return
  }
  ui.setActiveMainTab(next)
}

/** True when the view is currently showing beside the chat. */
export function isOpenBesideChat(view: BesideChatView): boolean {
  const ui = useUIStore.getState()
  if (view === "terminal") return ui.isBottomTerminalOpen
  return ui.splitPaneEnabled && ui.splitPaneRightTab === view
}
