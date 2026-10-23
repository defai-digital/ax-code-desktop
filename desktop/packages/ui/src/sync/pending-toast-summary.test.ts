import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Event } from "@defai-digital/ax-code-sdk/v2/client"

vi.mock("@/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui")>()
  return { ...actual, toast: { ...actual.toast, info: vi.fn(), dismiss: vi.fn(), success: vi.fn(), error: vi.fn() } }
})

import { toast } from "@/components/ui"
import { HIGH_TOUCH_SOFT_LIMIT } from "@/lib/supervision/sessionState"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { ChildStoreManager } from "./child-store"
import { createEventRoutingIndex } from "./event-routing"
import { handleEvent } from "./sync-context-impl"

const info = vi.mocked(toast.info)
const dismiss = vi.mocked(toast.dismiss)

let manager: ChildStoreManager
let routing: ReturnType<typeof createEventRoutingIndex>
const send = (type: string, properties: unknown) =>
  handleEvent("/repo", { type, properties } as Event, manager, routing, { skipPermissionAutoAccept: true })
const ask = (n: number) => send("permission.asked", { id: `req_${n}`, sessionID: `ses_${n}`, permission: "bash" })
const reply = (n: number) => send("permission.replied", { requestID: `req_${n}`, sessionID: `ses_${n}` })
const requestToasts = () => info.mock.calls.filter(([, options]) => options?.id !== "pending-summary")
const summaryCalls = () => info.mock.calls.filter(([, options]) => options?.id === "pending-summary")

beforeEach(() => {
  manager = new ChildStoreManager()
  manager.ensureChild("/repo", { bootstrap: false })
  routing = createEventRoutingIndex()
  info.mockClear()
  dismiss.mockClear()
})

describe("pending request toasts", () => {
  test("requests up to the limit each get their own toast and no summary", () => {
    for (let n = 1; n <= HIGH_TOUCH_SOFT_LIMIT; n += 1) ask(100 + n)
    expect(requestToasts()).toHaveLength(HIGH_TOUCH_SOFT_LIMIT)
    expect(summaryCalls()).toHaveLength(0)
    for (let n = 1; n <= HIGH_TOUCH_SOFT_LIMIT; n += 1) reply(100 + n)
  })

  test("past the limit one summary toast stands for the rest and its count follows the queue", () => {
    const total = HIGH_TOUCH_SOFT_LIMIT + 3
    for (let n = 1; n <= total; n += 1) ask(200 + n)
    expect(requestToasts()).toHaveLength(HIGH_TOUCH_SOFT_LIMIT)
    const calls = summaryCalls()
    expect(calls).toHaveLength(3)
    expect(calls.at(-1)?.[0]).toContain(String(total))

    // Answering one keeps the queue above the limit, so the summary updates instead of disappearing.
    info.mockClear()
    reply(201)
    expect(summaryCalls().at(-1)?.[0]).toContain(String(total - 1))
    expect(dismiss).not.toHaveBeenCalledWith("pending-summary")

    // Draining the queue to the limit removes the summary.
    for (let n = 2; n <= total; n += 1) reply(200 + n)
    expect(dismiss).toHaveBeenCalledWith("pending-summary")
  })

  test("a re-published ask that adds the allow-once deadline does not toast a second time", () => {
    const stamped = (n: number, autoOnceAt?: number) =>
      send("permission.asked", { id: `req_${n}`, sessionID: `ses_${n}`, permission: "hook", ...(autoOnceAt ? { autoOnceAt } : {}) })
    stamped(400)
    stamped(400, Date.now() + 15_000)
    stamped(400, Date.now() + 15_000)
    expect(requestToasts()).toHaveLength(1)
    reply(400)
  })

  test("the summary action opens the Needs you list", () => {
    for (let n = 1; n <= HIGH_TOUCH_SOFT_LIMIT + 1; n += 1) ask(300 + n)
    useSupervisionStore.getState().setNeedsYouPopoverOpen(false)
    const action = summaryCalls().at(-1)?.[1]?.action as unknown as { onClick: () => void }
    action.onClick()
    expect(useSupervisionStore.getState().needsYouPopoverOpen).toBe(true)
    for (let n = 1; n <= HIGH_TOUCH_SOFT_LIMIT + 1; n += 1) reply(300 + n)
  })
})
