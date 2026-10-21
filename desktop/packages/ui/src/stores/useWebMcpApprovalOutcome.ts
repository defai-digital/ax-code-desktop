import { redactWebMcpText } from "../../../../shared/webmcp-redaction.mjs"
import { readWebMcpDefinitionDigest } from "@/lib/toolHelpers"
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

type Approval = { permission?: string; tool?: { callID: string }; metadata?: Record<string, unknown> }
/** Reconcile only an accepted runtime snapshot; failed or stale fetches must never expire a request. */
export function reconcileWebMcpApprovals(session: string, before: readonly Approval[], after: readonly Approval[]) {
  for (const request of [...before, ...after]) recordWebMcpApprovalReceipt(session, request)
  const pending = new Set(after.flatMap((request) => request.tool?.callID ? [request.tool.callID] : []))
  for (const request of before) {
    const call = request.tool?.callID
    if (call && !pending.has(call)) recordWebMcpApproval(session, call, "unanswered")
  }
  for (const call of pending) recordWebMcpApproval(session, call, "pending")
}

export type WebMcpApprovalReceipt = { definitionDigest?: string; inputPreview?: string }
/** Only redacted permission metadata, scoped by session and call. Never persisted. */
export const useWebMcpApprovalReceipts = create<{ receipts: ReadonlyMap<string, WebMcpApprovalReceipt> }>(() => ({ receipts: new Map() }))
export function recordWebMcpApprovalReceipt(session: string, request: Approval) {
  if (request.permission !== "webmcp" || !request.tool?.callID || !request.metadata) return
  const definitionDigest = readWebMcpDefinitionDigest(request.metadata)
  const preview = request.metadata.inputPreview
  const safePreview = typeof preview === "string" ? redactWebMcpText(preview) : undefined
  const marker = typeof preview === "string" ? preview.match(/… \(\d+ bytes, \d+ not shown\)$/)?.[0] : undefined
  const inputPreview = marker && safePreview && !safePreview.endsWith(marker) ? `${safePreview}${marker}` : safePreview
  // The signed runtime's preview is bounded; oversize future receipts retain an explicit truncation marker.
  const byteLength = (value: string) => new TextEncoder().encode(value).byteLength
  const receipt: WebMcpApprovalReceipt = {
    ...(definitionDigest ? { definitionDigest } : {}),
    ...(inputPreview !== undefined ? { inputPreview: inputPreview.length > 65536
      ? `${inputPreview.slice(0, 65536)}… (${byteLength(inputPreview)} bytes, ${byteLength(inputPreview) - byteLength(inputPreview.slice(0, 65536))} not shown)` : inputPreview } : {}),
  }
  const receipts = new Map(useWebMcpApprovalReceipts.getState().receipts)
  const key = keyFor(session, request.tool.callID)
  if (JSON.stringify(receipts.get(key)) === JSON.stringify(receipt)) return
  receipts.delete(key)
  receipts.set(key, receipt)
  while (receipts.size > 256) receipts.delete(receipts.keys().next().value!)
  useWebMcpApprovalReceipts.setState({ receipts })
}
