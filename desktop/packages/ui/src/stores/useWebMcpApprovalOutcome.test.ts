import { afterEach, expect, test } from "vitest"
import { recordWebMcpApproval, reconcileWebMcpApprovals, useWebMcpApprovalOutcomes } from "./useWebMcpApprovalOutcome"
afterEach(() => useWebMcpApprovalOutcomes.setState({ calls: new Map() }))
const request = { permission: "webmcp", tool: { callID: "call-1" } }
const outcome = () => useWebMcpApprovalOutcomes.getState().calls.get(JSON.stringify(["ses_1", "call-1"]))
test("an accepted runtime snapshot that removes a request keeps an unanswered receipt", () => {
  reconcileWebMcpApprovals("ses_1", [], [request])
  expect(outcome()).toBe("pending")
  reconcileWebMcpApprovals("ses_1", [request], [])
  expect(outcome()).toBe("unanswered")
})
test("a recorded answer survives delayed snapshots and disappearance", () => {
  recordWebMcpApproval("ses_1", "call-1", "answered")
  reconcileWebMcpApprovals("ses_1", [], [request])
  reconcileWebMcpApprovals("ses_1", [request], [])
  expect(outcome()).toBe("answered")
})
test("receipts are bounded and isolated by session", () => {
  recordWebMcpApproval("ses_1", "call-1", "unanswered")
  recordWebMcpApproval("ses_2", "call-1", "answered")
  expect(outcome()).toBe("unanswered")
  for (let index = 0; index < 300; index++) recordWebMcpApproval("ses_1", `call-${index}`, "pending")
  expect(useWebMcpApprovalOutcomes.getState().calls.size).toBe(256)
})

import { recordWebMcpApprovalReceipt, useWebMcpApprovalReceipts } from "./useWebMcpApprovalOutcome"
import { collectWebMcpCalls } from "@/lib/webMcpCalls"
test("permission-only receipts survive answer and snapshot removal and enrich completed calls", () => {
  useWebMcpApprovalReceipts.setState({ receipts: new Map() })
  const permission = { ...request, metadata: { definitionDigest: "a".repeat(64), inputPreview: JSON.stringify({ title: "original", headers: [["x-api-key", "PRIVATE"]] }) } }
  reconcileWebMcpApprovals("ses_1", [], [permission])
  recordWebMcpApproval("ses_1", "call-1", "answered")
  reconcileWebMcpApprovals("ses_1", [permission], [])
  const read = (session: string) => collectWebMcpCalls([{ id: "m1" }], () => [{ type: "tool", tool: "desktop_webmcp", callID: "call-1", state: {
    status: "completed", input: { action: "invoke", toolName: "echo" }, metadata: { operation: "invoke" }, output: "{}",
  } }], 20, undefined, [], useWebMcpApprovalReceipts.getState().receipts, session)[0]
  expect(read("ses_1")).toMatchObject({ definitionDigest: "a".repeat(64), inputKind: "preview", input: { title: "original", headers: [["x-api-key", "[redacted]"]] } })
  expect(JSON.stringify(read("ses_1"))).not.toContain("PRIVATE")
  expect(read("ses_2").definitionDigest).toBeNull()
  for (let n = 0; n < 300; n++) recordWebMcpApprovalReceipt("ses_1", { ...permission, tool: { callID: `bounded-${n}` } })
  expect(useWebMcpApprovalReceipts.getState().receipts.size).toBe(256)
  expect(read("ses_1").inputKind).toBe("missing")
})
test("redacting a truncated approval preview preserves its incompleteness marker", () => {
  recordWebMcpApprovalReceipt("ses_1", { ...request, metadata: { inputPreview: '{"password":"SECRET… (4096 bytes, 2048 not shown)' } })
  const receipt = useWebMcpApprovalReceipts.getState().receipts.get(JSON.stringify(["ses_1", "call-1"]))!
  expect(receipt.inputPreview).toBe("[redacted]… (4096 bytes, 2048 not shown)")
})

test("permission receipt retention propagates shared projection truncation into completed calls", () => {
  let input: Record<string, unknown> = { unseen: 1 }
  for (let depth = 0; depth < 40; depth++) input = { nested: input }
  recordWebMcpApprovalReceipt("ses_1", { ...request, metadata: { inputPreview: JSON.stringify(input) } })
  const call = collectWebMcpCalls([{ id: "m1" }], () => [{ type: "tool", tool: "desktop_webmcp", callID: "call-1", state: {
    status: "completed", metadata: { operation: "invoke" }, output: "{}",
  } }], 20, undefined, [], useWebMcpApprovalReceipts.getState().receipts, "ses_1")[0]
  expect(call).toMatchObject({ inputKind: "truncated", input: null })
})
