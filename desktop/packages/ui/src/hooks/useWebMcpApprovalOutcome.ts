import React from "react"
import { useSessionPermissions } from "@/sync/sync-context"
import { recordWebMcpApproval, useWebMcpApprovalOutcomes } from "@/stores/useWebMcpApprovalOutcome"
export function useWebMcpApprovalOutcome(session: string, directory: string) {
  const permissions = useSessionPermissions(session, directory)
  const signature = JSON.stringify(permissions.flatMap((permission) => permission.tool?.callID ? [permission.tool.callID] : []))
  React.useEffect(() => {
    const pending = new Set<string>(JSON.parse(signature))
    for (const id of pending) recordWebMcpApproval(session, id, "pending")
    for (const [key, outcome] of useWebMcpApprovalOutcomes.getState().calls) {
      const [owner, id] = JSON.parse(key) as string[]
      if (owner === session && outcome === "pending" && !pending.has(id)) recordWebMcpApproval(session, id, "unanswered")
    }
  }, [session, signature])
  return useWebMcpApprovalOutcomes((state) => state.calls)
}
