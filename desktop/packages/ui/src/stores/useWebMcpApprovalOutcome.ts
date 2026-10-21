import { create } from "zustand"

/** Bounded, ephemeral presentation receipts. No permission or grant is created here. */
export const useWebMcpApprovalOutcomes = create<{ calls: ReadonlyMap<string, "pending" | "answered" | "unanswered"> }>(() => ({ calls: new Map() }))
const keyFor = (session: string, call: string) => JSON.stringify([session, call])
export function recordWebMcpApproval(session: string, call: string, outcome: "pending" | "answered" | "unanswered") {
  const calls = new Map(useWebMcpApprovalOutcomes.getState().calls)
  const key = keyFor(session, call)
  if (calls.get(key) === outcome || calls.get(key) === "answered") return
  calls.delete(key)
  calls.set(key, outcome)
  while (calls.size > 256) calls.delete(calls.keys().next().value!)
  useWebMcpApprovalOutcomes.setState({ calls })
}

type Approval = { permission?: string; tool?: { callID: string } }
/** Reconcile only an accepted runtime snapshot; failed or stale fetches must never expire a request. */
export function reconcileWebMcpApprovals(session: string, before: readonly Approval[], after: readonly Approval[]) {
  const pending = new Set(after.flatMap((request) => request.tool?.callID ? [request.tool.callID] : []))
  for (const request of before) {
    const call = request.tool?.callID
    if (call && !pending.has(call)) recordWebMcpApproval(session, call, "unanswered")
  }
  for (const call of pending) recordWebMcpApproval(session, call, "pending")
}
