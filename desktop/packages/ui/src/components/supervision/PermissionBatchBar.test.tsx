import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { PendingRequestEntry } from "@/sync/sync-context"
import { cleanup, fireEvent, render, screen } from "@/test/dom"

const decisions = vi.hoisted(() => ({
  records: new Map<string, { phase: string }>(),
  submit: vi.fn<(identity: { sessionId: string; requestId: string }, decision: string) => Promise<void>>(),
}))
vi.mock("@/stores/useRequestDecisionStore", () => ({
  requestDecisionKey: ({ sessionId, requestId }: { sessionId: string; requestId: string }) => `${sessionId}:${requestId}`,
  submitRequestDecision: decisions.submit,
  useRequestDecisionStore: { getState: () => ({ records: decisions.records }) },
}))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))
import { PermissionBatchBar } from "./PermissionBatchBar"
import { permissionBatches } from "@/lib/supervision/batchRequests"

const entry = (id: string, sessionId: string): PendingRequestEntry =>
  ({ kind: "permission", sessionId, request: { id, permission: "edit", patterns: [`src/${id}.ts`] } }) as unknown as PendingRequestEntry

beforeEach(() => {
  decisions.records.clear()
  decisions.submit.mockReset()
  decisions.submit.mockImplementation(async (identity) => {
    decisions.records.set(`${identity.sessionId}:${identity.requestId}`, { phase: "accepted" })
  })
})
afterEach(() => cleanup())

describe("PermissionBatchBar", () => {
  test("a first click arms the decision and shows every scope; only the second click answers each listed request once", async () => {
    const [batch] = permissionBatches([entry("p1", "s1"), entry("p2", "s2")])
    const { container } = render(<PermissionBatchBar batch={batch} />)
    fireEvent.click(screen.getByRole("button", { name: "supervision.batch.allowAll:2" }))
    expect(decisions.submit).not.toHaveBeenCalled()
    expect(container.textContent).toContain("src/p1.ts")
    expect(container.textContent).toContain("src/p2.ts")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "supervision.batch.confirmAllow:2|edit" }))
    })
    expect(decisions.submit.mock.calls.map(([identity, decision]) => [identity.sessionId, identity.requestId, decision])).toEqual([
      ["s1", "p1", "once"],
      ["s2", "p2", "once"],
    ])
    expect(screen.getByRole("status").textContent).toBe("supervision.batch.done:2")
  })

  test("a set swapped since arming, even with the same count, must be armed again", async () => {
    const [batch] = permissionBatches([entry("p1", "s1"), entry("p2", "s2")])
    const view = render(<PermissionBatchBar batch={batch} />)
    fireEvent.click(screen.getByRole("button", { name: "supervision.batch.denyAll:2" }))
    // s2's request was answered elsewhere and s3's arrived: same count, different requests.
    const [swapped] = permissionBatches([entry("p1", "s1"), entry("p2", "s3")])
    view.rerender(<PermissionBatchBar batch={swapped} />)
    fireEvent.click(screen.getByRole("button", { name: "supervision.batch.denyAll:2" }))
    expect(decisions.submit).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "supervision.batch.confirmDeny:2|edit" }))
    })
    expect(decisions.submit.mock.calls.map(([identity, decision]) => [identity.sessionId, decision])).toEqual([
      ["s1", "reject"],
      ["s3", "reject"],
    ])
  })

  test("a reply that never settles stops waiting and the result says which responses are unconfirmed", async () => {
    vi.useFakeTimers()
    try {
      decisions.submit.mockImplementation(async (identity) => {
        if (identity.requestId === "p2") return new Promise<void>(() => {})
        decisions.records.set(`${identity.sessionId}:${identity.requestId}`, { phase: "accepted" })
      })
      const [batch] = permissionBatches([entry("p1", "s1"), entry("p2", "s2")])
      render(<PermissionBatchBar batch={batch} />)
      fireEvent.click(screen.getByRole("button", { name: "supervision.batch.allowAll:2" }))
      fireEvent.click(screen.getByRole("button", { name: "supervision.batch.confirmAllow:2|edit" }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      })
      expect(screen.getByRole("status").textContent).toBe("supervision.batch.partial:1|1")
      expect((screen.getByRole("button", { name: "supervision.batch.allowAll:2" }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
