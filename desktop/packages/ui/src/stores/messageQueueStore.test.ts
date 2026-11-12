import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  MESSAGE_QUEUE_MAX_PER_SESSION,
  claimQueuedDispatch,
  releaseQueuedDispatchClaim,
  useMessageQueueStore,
} from "./messageQueueStore"
import type { AttachedFile } from "./types/sessionTypes"

describe("messageQueueStore", () => {
  beforeEach(() => {
    useMessageQueueStore.getState().clearAllQueues()
  })

  it("clearSessions drops queues for deleted sessions only", async () => {
    useMessageQueueStore.getState().addToQueue("ses_deleted", { content: "stale" })
    useMessageQueueStore.getState().addToQueue("ses_kept", { content: "live" })

    useMessageQueueStore.getState().clearSessions(["ses_deleted", "ses_unknown"])

    expect(useMessageQueueStore.getState().getQueueForSession("ses_deleted")).toHaveLength(0)
    expect(useMessageQueueStore.getState().queuedMessages["ses_deleted"]).toBeUndefined()
    expect(useMessageQueueStore.getState().getQueueForSession("ses_kept")).toHaveLength(1)
  })

  it("refuses entries once the session queue is full instead of dropping the oldest", async () => {
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

  it("prevents two windows that both observed an absent claim from dispatching", async () => {
    let tail = Promise.resolve()
    const request = vi.fn((_name: string, callback: () => boolean) => {
      const result = tail.then(callback)
      tail = result.then(() => undefined)
      return result
    })
    const locks = Object.getOwnPropertyDescriptor(navigator, "locks")
    const storage = Object.getOwnPropertyDescriptor(window, "localStorage")
    const entries = new Map<string, string>()
    let interleave = true
    let competing: ReturnType<typeof claimQueuedDispatch> | undefined
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } })
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        get length() {
          return entries.size
        },
        key: (index: number) => [...entries.keys()][index] ?? null,
        getItem: (key: string) => {
          const observed = entries.get(key) ?? null
          if (interleave && key === "oc.queue.dispatch.queued-locked") {
            interleave = false
            competing = claimQueuedDispatch("queued-locked")
          }
          return observed
        },
        setItem: (key: string, value: string) => {
          entries.set(key, value)
        },
        removeItem: (key: string) => {
          entries.delete(key)
        },
      },
    })
    try {
      expect(await claimQueuedDispatch("queued-locked")).toBe(true)
      expect(await competing).toBe(false)
    } finally {
      if (locks) Object.defineProperty(navigator, "locks", locks)
      else Reflect.deleteProperty(navigator, "locks")
      if (storage) Object.defineProperty(window, "localStorage", storage)
    }
  })

  it("gives the first window the dispatch claim for a queued entry", async () => {
    // Two windows see the same busy → idle edge with the same entry in their shared
    // queue; without a claim both would send it.
    expect(await claimQueuedDispatch("queued-1")).toBe(true)
    expect(await claimQueuedDispatch("queued-1")).toBe(false)
  })

  it("frees the claim again after a failed send", async () => {
    expect(await claimQueuedDispatch("queued-2")).toBe(true)
    releaseQueuedDispatchClaim("queued-2")
    expect(await claimQueuedDispatch("queued-2")).toBe(true)
  })

  it("ignores and prunes an expired claim", async () => {
    window.localStorage.setItem("oc.queue.dispatch.queued-3", String(Date.now() - 120_000))
    expect(await claimQueuedDispatch("queued-3")).toBe(true)
    // The stale key was replaced by the fresh claim, not duplicated.
    expect(window.localStorage.getItem("oc.queue.dispatch.queued-3")).not.toBeNull()
  })

  it("loses the claim when another window overwrites the record right after the write", async () => {
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
      expect(await claimQueuedDispatch("queued-race")).toBe(false)
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "localStorage", originalDescriptor)
      }
    }
  })

  it("treats a claim written without a token (older build) as expired", async () => {
    window.localStorage.setItem("oc.queue.dispatch.queued-legacy", "not-a-timestamp")
    expect(await claimQueuedDispatch("queued-legacy")).toBe(true)
  })

  it("rehydrates from another window's storage write", async () => {
    useMessageQueueStore.getState().addToQueue("ses_shared", { content: "from another window" })
    const persisted = window.localStorage.getItem("message-queue-store")
    expect(persisted).toContain("from another window")
  })

  it("falls back to an empty queue when the persisted payload has the wrong shape", async () => {
    window.localStorage.setItem("message-queue-store", JSON.stringify({ state: { queuedMessages: null }, version: 0 }))
    await useMessageQueueStore.persist.rehydrate()
    expect(useMessageQueueStore.getState().queuedMessages).toEqual({})
    expect(useMessageQueueStore.getState().getQueueForSession("ses_x")).toEqual([])
  })

  it("drops malformed queue entries during rehydration", async () => {
    window.localStorage.setItem(
      "message-queue-store",
      JSON.stringify({
        state: {
          queuedMessages: {
            ses_good: [{ id: "queued-1", content: "hi", createdAt: 1 }],
            ses_bad_shape: "oops",
            ses_mixed: [{ id: "queued-2", content: "ok", createdAt: 2 }, { content: "no id" }],
          },
        },
        version: 0,
      }),
    )
    await useMessageQueueStore.persist.rehydrate()
    expect(useMessageQueueStore.getState().queuedMessages).toEqual({
      ses_good: [{ id: "queued-1", content: "hi", createdAt: 1 }],
      ses_mixed: [{ id: "queued-2", content: "ok", createdAt: 2 }],
    })
  })

  it("keeps queue actions callable when persisted data contains action names", async () => {
    const original = useMessageQueueStore.getState()
    window.localStorage.setItem(
      "message-queue-store",
      JSON.stringify({
        state: {
          queuedMessages: { ses_saved: [{ id: "queued-saved", content: "saved", createdAt: 1 }] },
          queueModeEnabled: true,
          addToQueue: null,
          getQueueForSession: "stale data",
          clearAllQueues: false,
        },
        version: 0,
      }),
    )
    try {
      await useMessageQueueStore.persist.rehydrate()
      const restored = useMessageQueueStore.getState()
      expect(restored.addToQueue).toBe(original.addToQueue)
      expect(restored.getQueueForSession).toBe(original.getQueueForSession)
      expect(restored.clearAllQueues).toBe(original.clearAllQueues)
      expect(restored.queueModeEnabled).toBe(true)
      expect(restored.getQueueForSession("ses_saved")[0]?.content).toBe("saved")
      expect(restored.addToQueue("ses_saved", { content: "new" })).toBe(true)
      expect(restored.getQueueForSession("ses_saved")).toHaveLength(2)
      restored.clearAllQueues()
      expect(restored.getQueueForSession("ses_saved")).toEqual([])
    } finally {
      useMessageQueueStore.setState(original, true)
    }
  })

  it.each([{ length: 1 }, "invalid attachments"])(
    "restores editable queue text with a malformed attachment list (%j)",
    async (attachments) => {
      window.localStorage.setItem(
        "message-queue-store",
        JSON.stringify({
          state: {
            queuedMessages: {
              ses_saved: [{ id: "queued-saved", content: "keep this prompt", createdAt: 1, attachments }],
            },
          },
          version: 0,
        }),
      )
      await useMessageQueueStore.persist.rehydrate()
      const popped = useMessageQueueStore.getState().popToInput("ses_saved", "queued-saved")
      expect(popped?.content).toBe("keep this prompt")
      // Editing a chip appends these attachments to the live composer's array.
      expect(() => [...(popped?.attachments ?? [])]).not.toThrow()
      expect(popped?.attachments ?? []).toEqual([])
    },
  )

  it("keeps valid serialized attachments while dropping malformed attachment entries", async () => {
    const attachment: AttachedFile = {
      id: "saved-file",
      file: new File(["ok"], "saved.txt", { type: "text/plain" }),
      filename: "saved.txt",
      mimeType: "text/plain",
      dataUrl: "data:text/plain;base64,b2s=",
      size: 2,
      source: "local",
    }
    const serialized = JSON.parse(JSON.stringify(attachment))
    const server = { ...serialized, source: "server", serverPath: "/tmp/saved.txt" }
    const resource = {
      ...serialized,
      source: "mcp-resource",
      resource: { clientName: "fixture", uri: "fixture://file" },
    }
    window.localStorage.setItem(
      "message-queue-store",
      JSON.stringify({
        state: {
          queuedMessages: {
            ses_saved: [
              {
                id: "queued-saved",
                content: "keep this file",
                createdAt: 1,
                attachments: [
                  null,
                  false,
                  {},
                  { ...serialized, id: 5 },
                  { ...serialized, filename: null },
                  { ...serialized, resource: null },
                  { ...serialized, size: -1 },
                  serialized,
                  server,
                  resource,
                ],
              },
            ],
          },
        },
        version: 0,
      }),
    )
    await useMessageQueueStore.persist.rehydrate()
    expect(useMessageQueueStore.getState().getQueueForSession("ses_saved")[0]?.attachments).toEqual([
      serialized,
      server,
      resource,
    ])
  })
})
