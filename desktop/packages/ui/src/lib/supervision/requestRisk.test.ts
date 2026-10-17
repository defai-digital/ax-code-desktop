import { describe, expect, test } from "vitest"
import type { PermissionRequest } from "@/types/permission"
import type { QuestionRequest } from "@/types/question"
import type { PendingRequestEntry } from "@/sync/sync-context"
import {
  canAlwaysAllow,
  orderPermissionsByRisk,
  orderRequestsByRisk,
  permissionRiskLevel,
  requestRiskLevel,
} from "./requestRisk"

const permission = (id: string, fields: Partial<PermissionRequest> = {}): PendingRequestEntry => ({
  kind: "permission",
  sessionId: "ses_1",
  request: {
    id,
    sessionID: "ses_1",
    permission: "bash",
    patterns: ["*"],
    metadata: {},
    always: [],
    ...fields,
  },
})

const question = (id: string): PendingRequestEntry => ({
  kind: "question",
  sessionId: "ses_1",
  request: { id, sessionID: "ses_1", questions: [] } as QuestionRequest,
})

describe("permissionRiskLevel", () => {
  test("must-decide wins over the risk class", () => {
    expect(permissionRiskLevel({ interactiveOnly: true, riskClass: "safe" })).toBe("decide")
    expect(permissionRiskLevel({ riskClass: "risk" })).toBe("risk")
    expect(permissionRiskLevel({ riskClass: "safe", interactiveOnly: false })).toBe("safe")
    expect(permissionRiskLevel({ riskClass: "unknown" })).toBe("unknown")
  })

  test("an older runtime that sends no fields is unknown", () => {
    expect(permissionRiskLevel({})).toBe("unknown")
    expect(requestRiskLevel(question("q"))).toBe("unknown")
  })
})

describe("orderRequestsByRisk", () => {
  test("orders must-decide, risky, unclassified and questions, then safe, keeping order inside a level", () => {
    const ordered = orderRequestsByRisk([
      permission("safe-1", { riskClass: "safe" }),
      question("question-1"),
      permission("risk-1", { riskClass: "risk" }),
      permission("legacy-1"),
      permission("decide-1", { riskClass: "risk", interactiveOnly: true }),
      permission("risk-2", { riskClass: "risk" }),
    ])
    expect(ordered.map((entry) => entry.request.id)).toEqual([
      "decide-1",
      "risk-1",
      "risk-2",
      "question-1",
      "legacy-1",
      "safe-1",
    ])
  })

  test("leaves requests from an older runtime in their original order", () => {
    const entries = [permission("a"), question("b"), permission("c")]
    expect(orderRequestsByRisk(entries)).toEqual(entries)
  })
})

test("canAlwaysAllow refuses only must-decide requests", () => {
  expect(canAlwaysAllow({ interactiveOnly: true })).toBe(false)
  expect(canAlwaysAllow({ interactiveOnly: false })).toBe(true)
  expect(canAlwaysAllow({})).toBe(true)
})

test("orderPermissionsByRisk puts a must-decide request first in one session's list", () => {
  const ordered = orderPermissionsByRisk([
    { id: "risk", riskClass: "risk" as const },
    { id: "safe", riskClass: "safe" as const },
    { id: "decide", interactiveOnly: true },
  ])
  expect(ordered.map((request) => request.id)).toEqual(["decide", "risk", "safe"])
})
