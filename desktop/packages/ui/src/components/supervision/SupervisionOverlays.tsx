import React from "react"

import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { MissionControl } from "./MissionControl"
import { MultiRunCompare } from "./MultiRunCompare"

/**
 * Supervision views that take over the main frame while keeping the chat mounted underneath, so returning
 * to a session is instant and nothing streaming is torn down. Compare wins over Mission Control because it
 * is opened from it.
 */
export const SupervisionMainOverlay: React.FC = () => {
  const missionControlOpen = useSupervisionStore((state) => state.missionControlOpen)
  const compareRunGroupKey = useSupervisionStore((state) => state.compareRunGroupKey)
  if (!missionControlOpen && !compareRunGroupKey) return null
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-background" data-supervision-overlay>
      {compareRunGroupKey ? <MultiRunCompare groupKey={compareRunGroupKey} /> : <MissionControl />}
    </div>
  )
}
