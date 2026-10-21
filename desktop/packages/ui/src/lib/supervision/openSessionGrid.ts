import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { restoreSessionGrid, type SessionGridLayout } from "./sessionGrid"
import { ratiosForLayout } from "./sessionGridPreferences"

export function openSessionGrid(sessions?: readonly { sessionId: string; directory: string | null }[]): void {
  const ui = useUIStore.getState()
  ui.setActiveMainTab("session-grid")
  if (useUIStore.getState().activeMainTab !== "session-grid") return
  if (sessions) {
    const layout = Math.max(1, Math.min(4, sessions.length)) as SessionGridLayout
    ui.setSessionGrid(
      restoreSessionGrid({
        layout,
        slots: sessions,
        ratios: ratiosForLayout(layout) ?? { columns: 0.5, rows: 0.5 },
      }),
    )
  }
  useSupervisionStore.setState({ missionControlOpen: false, compareRunGroupKey: null, needsYouPopoverOpen: false })
}
