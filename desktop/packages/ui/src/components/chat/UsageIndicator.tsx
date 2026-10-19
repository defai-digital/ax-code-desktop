import React from "react"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSession } from "@/sync/sync-context"
import { useConfigStore } from "@/stores/useConfigStore"
import { ContextUsageDisplay } from "@/components/ui/ContextUsageDisplay"
import { useChatSurfaceMode } from "./useChatSurfaceMode"

/**
 * Context usage in the composer. Surfaces with their own header show it there (the main window
 * header and the mini chat title bar), so the composer only shows it where no header exists.
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
  // is what re-renders this component as turns complete (same pattern as
  // Header's context usage display).
  const session = useSession(currentSessionId ?? null)

  const limit =
    currentModel && typeof currentModel.limit === "object" && currentModel.limit !== null
      ? (currentModel.limit as Record<string, unknown>)
      : null
  const contextLimit = limit && typeof limit.context === "number" ? limit.context : 0
  const outputLimit = limit && typeof limit.output === "number" ? limit.output : 0

  const usage = currentSessionId && session ? getContextUsage(contextLimit, outputLimit) : null

  if (surfaceMode !== "default" || !usage || !currentSessionId || contextLimit <= 0) return null

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
    />
  )
})

UsageIndicator.displayName = "UsageIndicator"
