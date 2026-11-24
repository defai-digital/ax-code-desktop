import React from "react"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSession } from "@/sync/sync-context"
import { useConfigStore } from "@/stores/useConfigStore"
import { useUIStore } from "@/stores/useUIStore"
import { ContextUsageDisplay } from "@/components/ui/ContextUsageDisplay"
import { closeBesideChat, openBesideChat } from "@/lib/supervision/openBesideChat"
import { useChatSurfaceMode } from "./useChatSurfaceMode"

/**
 * Context usage beside the composer. The main window used to show the percentage in the title
 * bar; the token breakdown stays on this control (tooltip) and opens in the context panel.
 * Mini chat keeps the percentage in its own title bar.
 */
export const UsageIndicator: React.FC = React.memo(() => {
  const surfaceMode = useChatSurfaceMode()
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId)
  const getContextUsage = useSessionUIStore((s) => s.getContextUsage)
  // Select the derived model, not the stable getter: the selector re-runs when
  // the provider/model ids (or their model list) change, so a model switch
  // re-renders this memoized component even while the session is idle.
  const currentModel = useConfigStore((s) => s.getCurrentModel())
  // getContextUsage reads sync state imperatively; subscribing to the session
  // is what re-renders this component as turns complete.
  const session = useSession(currentSessionId ?? null)
  const contextOpen = useUIStore(
    (state) => !state.isMobile && state.splitPaneEnabled && state.splitPaneRightTab === "context",
  )
  const openBreakdown = React.useCallback(() => {
    if (useUIStore.getState().splitPaneEnabled && useUIStore.getState().splitPaneRightTab === "context") {
      closeBesideChat("context")
      return
    }
    openBesideChat("context")
  }, [])

  const limit =
    currentModel && typeof currentModel.limit === "object" && currentModel.limit !== null
      ? (currentModel.limit as Record<string, unknown>)
      : null
  const contextLimit = limit && typeof limit.context === "number" ? limit.context : 0
  const outputLimit = limit && typeof limit.output === "number" ? limit.output : 0

  const usage = currentSessionId && session ? getContextUsage(contextLimit, outputLimit) : null

  if (surfaceMode === "mini-chat" || !usage || !currentSessionId || contextLimit <= 0) return null

  return (
    <ContextUsageDisplay
      totalTokens={usage.totalTokens}
      percentage={usage.percentage}
      colorPercentage={usage.percentage}
      contextLimit={usage.contextLimit}
      outputLimit={usage.outputLimit}
      size="compact"
      hideIcon
      showPercentIcon
      onClick={openBreakdown}
      pressed={contextOpen}
      className="max-w-[6rem] shrink-0"
    />
  )
})

UsageIndicator.displayName = "UsageIndicator"
