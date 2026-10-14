import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Agent } from "@defai-digital/ax-code-sdk/v2"
import type { QueuedMessage } from "../stores/messageQueueStore"

let visibleAgents: Agent[] = []
const sendMessageCalls: unknown[][] = []
let sendShouldFail = false

/** Options argument of the captured sendMessage call (content is index 0). */
const sendOptionsOf = (index: number) => sendMessageCalls[index]?.[9] as { sessionId?: string; messageId?: string }

const getVisibleAgentsMock = vi.fn(() => visibleAgents)

const _mockSUIState: { currentSessionId: string | null; worktreeMetadata: Map<string, unknown> } = {
  currentSessionId: null,
  worktreeMetadata: new Map(),
}

// Stable map so tests can seed abort records that hasRecentAbort can read.
const mockSessionAbortFlags = new Map<string, { timestamp: number; acknowledged: boolean }>()

vi.doMock("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({}),
  },
}))

vi.doMock("@/stores/useAgentsStore", () => ({
  useAgentsStore: {
    getState: () => ({
      getVisibleAgents: getVisibleAgentsMock,
    }),
  },
}))

vi.doMock("@/sync/session-ui-store", () => ({
  routeMessage: vi.fn(() => Promise.resolve()),
  useSessionUIStore: {
    setState: (patch: unknown) => {
      const update =
        typeof patch === "function"
          ? (patch as (s: typeof _mockSUIState) => Partial<typeof _mockSUIState>)(_mockSUIState)
          : (patch as Partial<typeof _mockSUIState>)
      Object.assign(_mockSUIState, update)
    },
    getState: () => ({
      sendMessage: (...args: unknown[]) => {
        sendMessageCalls.push(args)
        return sendShouldFail ? Promise.reject(new Error("send failed")) : Promise.resolve()
      },
      sessionAbortFlags: mockSessionAbortFlags,
      currentSessionId: _mockSUIState.currentSessionId,
      worktreeMetadata: _mockSUIState.worktreeMetadata,
      getDirectoryForSession: (sessionId: string): string | null => {
        // Lazy require to avoid module hoisting issues with mock.module
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useSessionWorktreeStore } = require("@/sync/session-worktree-store") as {
          useSessionWorktreeStore: {
            getState: () => { getAttachment: (id: string) => Record<string, unknown> | undefined }
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getAttachedSessionDirectory } = require("@/sync/session-worktree-contract") as {
          getAttachedSessionDirectory: (attachment: Record<string, unknown> | undefined) => string | null
        }
        const attachment = useSessionWorktreeStore.getState().getAttachment(sessionId)
        return getAttachedSessionDirectory(attachment)
      },
    }),
    subscribe: vi.fn(() => () => undefined),
  },
}))

const statusState: { current: Record<string, { type: string }> } = { current: {} }

vi.doMock("@/sync/sync-context", () => ({
  useDirectorySync: (selector: (state: { session_status: Record<string, { type: string }> }) => unknown) =>
    selector({ session_status: statusState.current }),
  useAllSessionStatuses: () => statusState.current,
}))

vi.doMock("@/sync/sync-refs", () => ({
  getSyncSessionStatus: (sessionId: string) => statusState.current[sessionId],
  getGlobalSyncSessionStatus: (sessionId: string) => statusState.current[sessionId],
}))

const toastErrorMock = vi.fn()

vi.doMock("@/components/ui", () => ({
  toast: { success: vi.fn(), error: toastErrorMock },
}))

vi.doMock("@/lib/i18n/store", () => ({
  formatMessage: (_dictionary: unknown, key: string) => key,
  useI18nStore: { getState: () => ({ dictionary: {} }) },
}))

const {
  buildQueuedAutoSendPayload,
  computeQueuedAutoSendStatusUpdate,
  isQueuedAutoSendHeld,
  sendQueuedAutoSendPayload,
  shouldDispatchQueuedAutoSend,
  useQueuedMessageAutoSend,
} = await import("./useQueuedMessageAutoSend")
const { useSyncNotificationStore } = await import("@/sync/notification-store")
const { useMessageQueueStore, claimQueuedDispatch, releaseQueuedDispatchClaim } =
  await import("@/stores/messageQueueStore")

describe("shouldDispatchQueuedAutoSend", () => {
  test("dispatches only after an active session becomes idle", () => {
    expect(shouldDispatchQueuedAutoSend("busy", "idle")).toBe(true)
    expect(shouldDispatchQueuedAutoSend("retry", "idle")).toBe(true)
  })

  test("does not dispatch when idle is only first seen or status is missing", () => {
    expect(shouldDispatchQueuedAutoSend(undefined, "idle")).toBe(false)
    expect(shouldDispatchQueuedAutoSend("idle", "idle")).toBe(false)
  })
})

describe("computeQueuedAutoSendStatusUpdate", () => {
  test("dispatches a busy -> idle session and advances its baseline to idle", () => {
    const previous = new Map([["session-a", "busy" as const]])
    const queued = { "session-a": [{ id: "q1", content: "hi", createdAt: 1 }] }
    const statusRecord = { "session-a": { type: "idle" } }

    const { nextStatusMap, sessionIdsToDispatch } = computeQueuedAutoSendStatusUpdate(
      queued,
      statusRecord,
      previous,
      () => false,
    )

    expect(sessionIdsToDispatch).toEqual(["session-a"])
    expect(nextStatusMap.get("session-a")).toBe("idle")
  })

  test("keeps the busy baseline armed for a session whose auto-send is deferred", () => {
    const previous = new Map([["session-a", "busy" as const]])
    const queued = { "session-a": [{ id: "q1", content: "hi", createdAt: 1 }] }
    const statusRecord = { "session-a": { type: "idle" } }

    // Deferred (e.g. an unseen error hold): must not dispatch, and must not
    // advance the baseline to "idle" — otherwise the busy -> idle edge is
    // consumed with nothing left to re-trigger the auto-send once the hold lifts.
    const { nextStatusMap, sessionIdsToDispatch } = computeQueuedAutoSendStatusUpdate(
      queued,
      statusRecord,
      previous,
      () => true,
    )

    expect(sessionIdsToDispatch).toEqual([])
    expect(nextStatusMap.get("session-a")).toBe("busy")

    // Once the hold lifts, the edge is still armed and fires on the next tick
    // even though the status record itself did not change again.
    const { nextStatusMap: secondMap, sessionIdsToDispatch: secondDispatch } = computeQueuedAutoSendStatusUpdate(
      queued,
      statusRecord,
      nextStatusMap,
      () => false,
    )
    expect(secondDispatch).toEqual(["session-a"])
    expect(secondMap.get("session-a")).toBe("idle")
  })

  test("advances the baseline normally for sessions with no queued messages", () => {
    const previous = new Map([["session-b", "busy" as const]])
    const statusRecord = { "session-b": { type: "idle" } }

    const { nextStatusMap, sessionIdsToDispatch } = computeQueuedAutoSendStatusUpdate(
      {},
      statusRecord,
      previous,
      () => true,
    )

    expect(sessionIdsToDispatch).toEqual([])
    expect(nextStatusMap.get("session-b")).toBe("idle")
  })

  test("prunes sessions no longer present in either the status record or the queue", () => {
    const previous = new Map([
      ["session-a", "idle" as const],
      ["session-stale", "busy" as const],
    ])

    const { nextStatusMap } = computeQueuedAutoSendStatusUpdate(
      {},
      { "session-a": { type: "idle" } },
      previous,
      () => false,
    )

    expect(nextStatusMap.has("session-stale")).toBe(false)
    expect(nextStatusMap.get("session-a")).toBe("idle")
  })
})

describe("isQueuedAutoSendHeld", () => {
  test("holds auto-send while the session has an unseen error, matching the chips' Held label", () => {
    expect(isQueuedAutoSendHeld("session-err")).toBe(false)

    useSyncNotificationStore.getState().append({
      type: "error",
      session: "session-err",
      time: Date.now(),
      viewed: false,
      error: { message: "turn failed" },
    })
    expect(isQueuedAutoSendHeld("session-err")).toBe(true)

    // Viewing the session clears the unseen error and releases the hold.
    useSyncNotificationStore.getState().markSessionViewed("session-err")
    expect(isQueuedAutoSendHeld("session-err")).toBe(false)
  })
})

describe("buildQueuedAutoSendPayload", () => {
  beforeEach(() => {
    visibleAgents = []
    sendMessageCalls.length = 0
  })

  test("returns only the first queued message for auto-send", () => {
    const queue: QueuedMessage[] = [
      {
        id: "queued-1",
        content: "first queued message",
        createdAt: 1,
      },
      {
        id: "queued-2",
        content: "second queued message",
        createdAt: 2,
      },
    ]

    const payload = buildQueuedAutoSendPayload(queue)

    expect(payload).not.toBeNull()
    expect(payload?.queuedMessageId).toBe("queued-1")
    expect(payload?.primaryText).toBe("first queued message")
    expect(payload?.primaryAttachments).toEqual([])
  })

  test("uses the configured visible agents when parsing queued mentions", () => {
    visibleAgents = [
      {
        name: "Builder",
        mode: "subagent",
        permission: [],
        options: {},
      } as Agent,
    ]

    const queue: QueuedMessage[] = [
      {
        id: "queued-mention",
        content: "@Builder please take this",
        createdAt: 1,
      },
    ]

    const payload = buildQueuedAutoSendPayload(queue)

    expect(payload).not.toBeNull()
    expect(payload?.agentMentionName).toBe("Builder")
    expect(payload?.primaryText).toBe("@Builder please take this")
  })

  test("preserves attachment-only queued messages as sendable payloads", () => {
    const queue: QueuedMessage[] = [
      {
        id: "queued-attachments",
        content: "",
        createdAt: 1,
        attachments: [
          {
            id: "file-1",
            filename: "notes.txt",
            mimeType: "text/plain",
            size: 5,
            source: "local",
            file: new File(["hello"], "notes.txt", { type: "text/plain" }),
            dataUrl: "data:text/plain;base64,aGVsbG8=",
          },
        ],
      },
      {
        id: "queued-2",
        content: "later queued message",
        createdAt: 2,
      },
    ]

    const payload = buildQueuedAutoSendPayload(queue)

    expect(payload).not.toBeNull()
    expect(payload?.queuedMessageId).toBe("queued-attachments")
    expect(payload?.primaryText).toBe("")
    expect(payload?.primaryAttachments).toHaveLength(1)
    expect(payload?.primaryAttachments[0]?.filename).toBe("notes.txt")
  })

  test("auto-send targets the queued session explicitly", async () => {
    const payload = buildQueuedAutoSendPayload([
      {
        id: "queued-1",
        content: "queued message",
        createdAt: 1,
      },
    ])

    expect(payload).not.toBeNull()
    await sendQueuedAutoSendPayload(
      "session-original",
      payload!,
      {
        providerID: "provider-1",
        modelID: "model-1",
        agent: "agent-1",
        variant: "variant-1",
      },
      "msg_test_retry_id_0001",
    )

    expect(sendMessageCalls.length).toBe(1)
    expect(sendMessageCalls[0]).toEqual([
      "queued message",
      "provider-1",
      "model-1",
      "agent-1",
      [],
      undefined,
      undefined,
      "variant-1",
      "normal",
      // The retry id travels with the send so the server can deduplicate a repeat.
      { sessionId: "session-original", messageId: "msg_test_retry_id_0001" },
    ])
  })
})

describe("useQueuedMessageAutoSend hold lift", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let renderTick = 0

  const Probe = ({ tick }: { tick: number }) => {
    useQueuedMessageAutoSend(true)
    return React.createElement("div", { "data-tick": tick })
  }

  const render = () => {
    React.act(() => {
      root.render(React.createElement(Probe, { tick: (renderTick += 1) }))
    })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    renderTick = 0
    sendMessageCalls.length = 0
    sendShouldFail = false
    toastErrorMock.mockClear()
    mockSessionAbortFlags.clear()
    statusState.current = { "session-a": { type: "busy" } }
    useMessageQueueStore.setState({ queuedMessages: {} })
    useSyncNotificationStore.setState({
      list: [],
      index: {
        session: { unseenCount: {}, unseenHasError: {} },
        project: { unseenCount: {}, unseenHasError: {} },
      },
    })
  })

  afterEach(() => {
    React.act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("sends the queued message when the error hold lifts without another status change", async () => {
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })
    useSyncNotificationStore.getState().append({
      type: "error",
      session: "session-a",
      time: Date.now(),
      viewed: false,
      error: { message: "turn failed" },
    })

    // Arm the busy baseline, then observe the busy -> idle edge while the error hold is up.
    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})
    expect(sendMessageCalls).toHaveLength(0)

    // Viewing the session clears the hold; the armed edge must fire without any status change.
    await React.act(async () => {
      useSyncNotificationStore.getState().markSessionViewed("session-a")
    })

    expect(sendMessageCalls).toHaveLength(1)
    expect(sendMessageCalls[0][0]).toBe("queued message")
  })

  test("holds the queued message while the session's status is unknown", async () => {
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })

    // Arm the busy baseline, then the session disappears from the tracked record
    // (e.g. another project became active). An untracked session may still be
    // working, so nothing may be sent into it.
    render()
    statusState.current = {}
    render()
    await React.act(async () => {})

    expect(sendMessageCalls).toHaveLength(0)

    // The edge must still be armed: once the session is confirmed idle, the queued
    // message goes out. (Spending the edge on the unknown status would strand it.)
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    expect(sendMessageCalls).toHaveLength(1)
  })

  test("sends the queued entry under its own retry-stable message id", async () => {
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })
    // The retry id is minted at the first dispatch attempt, not at queue time: ids are
    // time-ordered and the message store renders by id, so an id taken while the queue
    // waited would sort this prompt above the replies that arrived in the meantime.
    expect(useMessageQueueStore.getState().getQueueForSession("session-a")[0].messageId).toBeUndefined()

    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    expect(sendMessageCalls).toHaveLength(1)
    expect(sendOptionsOf(0).sessionId).toBe("session-a")
    expect(sendOptionsOf(0).messageId).toMatch(/^msg_/)
  })

  test("reuses the same message id when a restored entry is dispatched again", async () => {
    // Regression: each attempt minted a fresh id, so a retry after an ambiguous or the
    // failed send below could deliver the same queued prompt twice — the server
    // deduplicates only by the id it is given.
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })
    const [queued] = useMessageQueueStore.getState().getQueueForSession("session-a")

    sendShouldFail = true
    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})
    expect(sendMessageCalls).toHaveLength(1)
    // The failed entry is back at the head, ready for the next edge.
    expect(useMessageQueueStore.getState().getQueueForSession("session-a").map((m) => m.id)).toEqual([queued.id])

    // Next idle edge: the retry must carry the same id so the server can deduplicate.
    sendShouldFail = false
    statusState.current = { "session-a": { type: "busy" } }
    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    expect(sendMessageCalls).toHaveLength(2)
    const firstId = sendOptionsOf(0).messageId
    // A real msg-branded id, not just "both undefined".
    expect(firstId).toMatch(/^msg_/)
    expect(sendOptionsOf(1).messageId).toBe(firstId)
  })

  test("surfaces a toast when the queued auto-send fails", async () => {
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })

    sendShouldFail = true
    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    // The entry is restored for a manual retry, and the failure is visible
    // instead of console-only.
    expect(toastErrorMock).toHaveBeenCalledWith("chat.queuedMessage.sendFailed", { id: "queued-auto-send-failed" })
    expect(useMessageQueueStore.getState().getQueueForSession("session-a")).toHaveLength(1)
  })

  test("a recent abort holds the queue, and the wake-up sends once the window lapses", async () => {
    vi.useFakeTimers()
    try {
      useMessageQueueStore.getState().addToQueue("session-a", {
        content: "queued message",
        sendConfig: { providerID: "provider-1", modelID: "model-1" },
      })
      // The user aborted the running turn just now (Esc/Esc): the busy -> idle
      // edge it produces must not fire the queue right away.
      mockSessionAbortFlags.set("session-a", { timestamp: Date.now(), acknowledged: false })

      render()
      statusState.current = { "session-a": { type: "idle" } }
      render()
      await React.act(async () => {})
      expect(sendMessageCalls).toHaveLength(0)

      // The window lapses on a clock; the scheduled wake-up spends the armed
      // edge instead of stranding the entry until an unrelated status change.
      await React.act(async () => {
        await vi.advanceTimersByTimeAsync(2100)
      })
      expect(sendMessageCalls).toHaveLength(1)
      expect(sendMessageCalls[0][0]).toBe("queued message")
    } finally {
      vi.useRealTimers()
    }
  })

  test("pins the retry id on the entry even when the claim is lost", async () => {
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })
    const [claimed] = useMessageQueueStore.getState().getQueueForSession("session-a")
    // Another window owns the entry; this one must not send it.
    expect(claimQueuedDispatch(claimed.id)).toBe(true)

    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    expect(sendMessageCalls).toHaveLength(0)
    // The retry id is persisted before the claim, so if the other window (or a
    // later retry here) dispatches the entry again it sends the SAME id and the
    // server deduplicates instead of delivering the prompt twice.
    const [after] = useMessageQueueStore.getState().getQueueForSession("session-a")
    expect(after.messageId).toMatch(/^msg_/)

    releaseQueuedDispatchClaim(claimed.id)
    statusState.current = { "session-a": { type: "busy" } }
    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    expect(sendMessageCalls).toHaveLength(1)
    expect(sendOptionsOf(0).messageId).toBe(after.messageId)
  })

  test("a lost cross-window claim does not wedge the session's auto-send", async () => {
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })
    const [claimed] = useMessageQueueStore.getState().getQueueForSession("session-a")
    // Another window owns this entry and sends it.
    expect(claimQueuedDispatch(claimed.id)).toBe(true)

    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})
    expect(sendMessageCalls).toHaveLength(0)

    // That window's copy of the queue and its claim go away; a new entry arrives.
    useMessageQueueStore.setState({ queuedMessages: {} })
    useMessageQueueStore.getState().addToQueue("session-a", {
      content: "later queued message",
      sendConfig: { providerID: "provider-1", modelID: "model-1" },
    })

    statusState.current = { "session-a": { type: "busy" } }
    render()
    statusState.current = { "session-a": { type: "idle" } }
    render()
    await React.act(async () => {})

    // The lost claim must not have left the session marked in-flight forever.
    expect(sendMessageCalls).toHaveLength(1)
    expect(sendMessageCalls[0][0]).toBe("later queued message")
  })
})
