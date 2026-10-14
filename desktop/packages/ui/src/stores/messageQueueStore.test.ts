import { beforeEach, describe, expect, it } from "vitest"
import {
  MESSAGE_QUEUE_MAX_PER_SESSION,
  claimQueuedDispatch,
  releaseQueuedDispatchClaim,
  useMessageQueueStore,
} from "./messageQueueStore"

describe("messageQueueStore", () => {
  beforeEach(() => {
    useMessageQueueStore.getState().clearAllQueues()
  })

  it("clearSessions drops queues for deleted sessions only", () => {
    useMessageQueueStore.getState().addToQueue("ses_deleted", { content: "stale" })
    useMessageQueueStore.getState().addToQueue("ses_kept", { content: "live" })

    useMessageQueueStore.getState().clearSessions(["ses_deleted", "ses_unknown"])

    expect(useMessageQueueStore.getState().getQueueForSession("ses_deleted")).toHaveLength(0)
    expect(useMessageQueueStore.getState().queuedMessages["ses_deleted"]).toBeUndefined()
    expect(useMessageQueueStore.getState().getQueueForSession("ses_kept")).toHaveLength(1)
  })

  it("refuses entries once the session queue is full instead of dropping the oldest", () => {
    // Regression: the cap trimmed the oldest entry, which is the next one to send - a
    // message the user had already written disappeared with no notice. Refusing lets
    // the caller keep the input it was about to queue.
    const sessionId = "ses_cap"
    const results: boolean[] = []
    for (let i = 0; i < MESSAGE_QUEUE_MAX_PER_SESSION + 10; i++) {
      results.push(useMessageQueueStore.getState().addToQueue(sessionId, { content: `msg-${i}` }))
    }

    expect(results.filter(Boolean)).toHaveLength(MESSAGE_QUEUE_MAX_PER_SESSION)
    const queue = useMessageQueueStore.getState().getQueueForSession(sessionId)
    expect(queue).toHaveLength(MESSAGE_QUEUE_MAX_PER_SESSION)
    expect(queue[0]?.content).toBe("msg-0")
    expect(queue[queue.length - 1]?.content).toBe(`msg-${MESSAGE_QUEUE_MAX_PER_SESSION - 1}`)
    expect(results.at(-1)).toBe(false)
  })

  it("gives the first window the dispatch claim for a queued entry", () => {
    // Two windows see the same busy → idle edge with the same entry in their shared
    // queue; without a claim both would send it.
    expect(claimQueuedDispatch("queued-1")).toBe(true)
    expect(claimQueuedDispatch("queued-1")).toBe(false)
  })

  it("frees the claim again after a failed send", () => {
    expect(claimQueuedDispatch("queued-2")).toBe(true)
    releaseQueuedDispatchClaim("queued-2")
    expect(claimQueuedDispatch("queued-2")).toBe(true)
  })

  it("ignores and prunes an expired claim", () => {
    window.localStorage.setItem("oc.queue.dispatch.queued-3", String(Date.now() - 120_000))
    expect(claimQueuedDispatch("queued-3")).toBe(true)
    // The stale key was replaced by the fresh claim, not duplicated.
    expect(window.localStorage.getItem("oc.queue.dispatch.queued-3")).not.toBeNull()
  })

  it("loses the claim when another window overwrites the record right after the write", () => {
    // The claim is check-then-set, so the losing interleaving is: our write lands,
    // the other window's write lands after it. Reading the record back and
    // requiring our own owner token is what makes the last writer win.
    // The storage object itself is swapped instead of spying on setItem: jsdom's
    // localStorage is getter-backed, so a spy on it is never called.
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage")
    const map = new Map<string, string>()
    const racingStorage = {
      get length() {
        return map.size
      },
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
        // Another window writes the same record immediately afterwards.
        if (key.startsWith("oc.queue.dispatch.")) map.set(key, `${Date.now()}:another-window`)
      },
      removeItem: (key: string) => {
        map.delete(key)
      },
      clear: () => map.clear(),
    }
    Object.defineProperty(window, "localStorage", { configurable: true, value: racingStorage })

    try {
      expect(claimQueuedDispatch("queued-race")).toBe(false)
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "localStorage", originalDescriptor)
      }
    }
  })

  it("treats a claim written without a token (older build) as expired", () => {
    window.localStorage.setItem("oc.queue.dispatch.queued-legacy", "not-a-timestamp")
    expect(claimQueuedDispatch("queued-legacy")).toBe(true)
  })

  it("rehydrates from another window's storage write", () => {
    useMessageQueueStore.getState().addToQueue("ses_shared", { content: "from another window" })
    const persisted = window.localStorage.getItem("message-queue-store")
    expect(persisted).toContain("from another window")
  })
})
