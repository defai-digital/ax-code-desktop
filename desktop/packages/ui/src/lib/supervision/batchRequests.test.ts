import { describe, expect, test } from "vitest"
import type { PendingRequestEntry } from "@/sync/sync-context"
import { permissionBatchSignature, permissionBatches } from "./batchRequests"

const permission = (
  id: string,
  sessionId: string,
  kind: string,
  extra: Record<string, unknown> = {},
): PendingRequestEntry =>
  ({ kind: "permission", sessionId, request: { id, permission: kind, patterns: [`${kind}:${id}`], ...extra } }) as unknown as PendingRequestEntry
const question = (id: string, sessionId: string): PendingRequestEntry =>
  ({ kind: "question", sessionId, request: { id, questions: [] } }) as unknown as PendingRequestEntry

describe("permissionBatches", () => {
  test("groups two or more requests of one permission and risk class; never questions, singletons, risky or must-decide", () => {
    const batches = permissionBatches([
      permission("p1", "s1", "bash", { riskClass: "safe" }),
      permission("p2", "s1", "edit"),
      question("q1", "s2"),
      permission("p3", "s2", "edit"),
      permission("p4", "s3", "edit"),
      permission("r1", "s1", "bash", { riskClass: "risk" }),
      permission("r2", "s2", "bash", { riskClass: "risk" }),
      permission("d1", "s1", "edit", { interactiveOnly: true }),
      permission("d2", "s2", "edit", { interactiveOnly: true }),
      permission("s1x", "s3", "bash", { riskClass: "safe" }),
    ])
    expect(batches.map((batch) => [batch.permission, batch.risk, batch.entries.map((entry) => entry.request.id), batch.sessionCount])).toEqual([
      ["bash", "safe", ["p1", "s1x"], 2],
      ["edit", "unknown", ["p2", "p3", "p4"], 3],
    ])
    expect(batches[1].patterns).toEqual(["edit:p2", "edit:p3", "edit:p4"])
  })

  test("leaves out requests that are already being answered, and signs the set by session and request", () => {
    const entries = [permission("p1", "s1", "edit"), permission("p1", "s2", "edit"), permission("p2", "s3", "edit")]
    const [batch] = permissionBatches(entries, (entry) => entry.sessionId !== "s3")
    expect(batch.entries.map((entry) => entry.sessionId)).toEqual(["s1", "s2"])
    // Request ids repeat across sessions; the signature must still tell the sets apart.
    const [other] = permissionBatches([permission("p1", "s1", "edit"), permission("p1", "s9", "edit")])
    expect(permissionBatchSignature(batch)).not.toBe(permissionBatchSignature(other))
  })
})
