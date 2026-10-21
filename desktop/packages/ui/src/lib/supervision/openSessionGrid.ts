import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { restoreSessionGrid } from "./sessionGrid"

export function openSessionGrid(sessions?: readonly { sessionId: string; directory: string | null }[]): void {
  const ui = useUIStore.getState()
  ui.setActiveMainTab("session-grid")
  if (useUIStore.getState().activeMainTab !== "session-grid") return
  if (sessions)
    ui.setSessionGrid(
      restoreSessionGrid({
        layout: Math.max(1, Math.min(4, sessions.length)),
        slots: sessions,
        ratios: { columns: 0.5, rows: 0.5 },
      }),
    )
  useSupervisionStore.setState({ missionControlOpen: false, compareRunGroupKey: null, needsYouPopoverOpen: false })
}
