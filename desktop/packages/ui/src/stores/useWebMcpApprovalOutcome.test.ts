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
