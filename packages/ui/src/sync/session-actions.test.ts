import { describe, expect, test, beforeEach, mock } from "bun:test"
import type { PermissionRequest } from "@/types/permission"
import type { Message, Part } from "@ax-code/sdk/v2/client"
import { resolveResyncedSessionStatus, hasCompletedAssistantReply } from "./reconnect-recovery"

// Mock SDK client that records permission.reply / question.reply calls
const replyCalls: Array<{ method: string; params: Record<string, unknown> }> = []

let configState: {
  isConnected: boolean
  hasEverConnected: boolean
  probeConnection: (options?: { timeoutMs?: number }) => Promise<boolean>
} = {
  isConnected: true,
  hasEverConnected: true,
  probeConnection: () => Promise.resolve(true),
}

function resetConfigState() {
  configState = {
    isConnected: true,
    hasEverConnected: true,
    probeConnection: () => Promise.resolve(true),
  }
}

// Configurable result for the session.messages refetch the accepted-prompt
// watchdog performs before fabricating a failure. Defaults to "server has
// nothing" so the watchdog falls through to the synthetic error.
let scopedMessagesResult: { data: Array<{ info: Message; parts?: Part[] }> } = { data: [] }
function resetScopedMessagesResult() {
  scopedMessagesResult = { data: [] }
}

const mockScopedClient = {
  permission: {
    reply: mock((params: Record<string, unknown>) => {
      replyCalls.push({ method: "permission.reply", params })
      return Promise.resolve({ data: true })
    }),
  },
  session: {
    messages: mock(() => Promise.resolve(scopedMessagesResult)),
  },
  question: {
    reply: mock((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reply", params })
      return Promise.resolve({ data: true })
    }),
    reject: mock((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reject", params })
      return Promise.resolve({ data: true })
    }),
  },
}

const mockSdk = {
  permission: {
    reply: mock((params: Record<string, unknown>) => {
      replyCalls.push({ method: "permission.reply", params })
      return Promise.resolve({ data: true })
    }),
  },
  question: {
    reply: mock((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reply", params })
      return Promise.resolve({ data: true })
    }),
    reject: mock((params: Record<string, unknown>) => {
      replyCalls.push({ method: "question.reject", params })
      return Promise.resolve({ data: true })
    }),
  },
}

// Mock axCodeClient singleton
mock.module("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getScopedSdkClient: () => mockScopedClient,
    getDirectory: () => "/test/project",
    checkHealth: () => Promise.resolve(true),
  },
}))

// Mock useConfigStore
mock.module("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => configState,
  },
}))

// Mock useSessionUIStore
mock.module("./session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      getDirectoryForSession: (sessionId: string) => {
        if (sessionId === "session-a") return "/test/project"
        if (sessionId === "session-b") return "/other/project"
        return null
      },
    }),
  },
}))

// Mock useInputStore (imported but not used in permission functions)
mock.module("./input-store", () => ({
  useInputStore: {},
}))

// Mock useGlobalSessionsStore (imported but not used in permission functions)
mock.module("@/stores/useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: {},
}))

// Mock sync-refs (imported but not used in permission functions)
mock.module("./sync-refs", () => ({
  registerSessionDirectory: () => {},
}))

import { create, type StoreApi } from "zustand"
import { INITIAL_STATE } from "./types"
import type { DirectoryStore } from "./child-store"
import type { AxCodeClient } from "@ax-code/sdk/v2/client"

function createStore(permissions: Record<string, PermissionRequest[]>): StoreApi<DirectoryStore> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    permission: permissions,
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))
}

function createChildStores(entries: Array<[string, StoreApi<DirectoryStore>]>) {
  return {
    children: new Map(entries),
    ensureChild: (dir: string) => {
      const store = new Map(entries).get(dir)
      if (!store) throw new Error(`No store for ${dir}`)
      return store
    },
  } as unknown as import("./child-store").ChildStoreManager
}

describe("respondToPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory from child store when permission is found", async () => {
    const permission: PermissionRequest = {
      id: "perm-1",
      sessionID: "session-a",
      permission: "bash",
      patterns: [],
      metadata: {},
      always: [],
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await respondToPermission("session-a", "perm-1", "once")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-1")
    expect(replyCalls[0].params.reply).toBe("once")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })

  test("passes directory from session mapping when permission not in store", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await respondToPermission("session-b", "perm-2", "always")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-2")
    expect(replyCalls[0].params.reply).toBe("always")
    expect(replyCalls[0].params.directory).toBe("/other/project")
  })

  test("passes directory from current directory as last resort", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/fallback/dir")

    await respondToPermission("unknown-session", "perm-3", "reject")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-3")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/fallback/dir")
  })
})

describe("dismissPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory and reply=reject", async () => {
    const permission: PermissionRequest = {
      id: "perm-10",
      sessionID: "session-a",
      permission: "edit",
      patterns: [],
      metadata: {},
      always: [],
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await dismissPermission("session-a", "perm-10")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-10")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("respondToQuestion passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory to question.reply", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToQuestion } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await respondToQuestion("session-a", "q-1", [["answer1"]])

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("q-1")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("rejectQuestion passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("passes directory to question.reject", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, rejectQuestion } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")

    await rejectQuestion("session-a", "q-2")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("q-2")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("optimisticSend responsiveness", () => {
  beforeEach(() => {
    replyCalls.length = 0
    resetConfigState()
  })

  test("inserts the optimistic user message before waiting for connection recovery", async () => {
    const store = createStore({})
    const childStores = createChildStores([["/test/project", store]])
    let sawOptimisticBeforeProbe = false

    configState = {
      isConnected: false,
      hasEverConnected: true,
      probeConnection: () => {
        sawOptimisticBeforeProbe = (store.getState().message["session-a"] ?? []).length === 1
        configState = {
          ...configState,
          isConnected: true,
        }
        return Promise.resolve(true)
      },
    }

    const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: {
            ...state.part,
            [message.id]: parts,
          },
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextMessages = messages.filter((message) => message.id !== messageID)
          const nextPart = { ...state.part }
          delete nextPart[messageID]
          return {
            message: {
              ...state.message,
              [sessionID]: nextMessages,
            },
            part: nextPart,
          }
        })
      },
    )

    let sendSawOptimistic = false
    await optimisticSend({
      sessionId: "session-a",
      content: "hello",
      providerID: "provider",
      modelID: "model",
      send: (messageID) => {
        const state = store.getState()
        sendSawOptimistic = state.message["session-a"]?.some((message: Message) => message.id === messageID) ?? false
        expect(state.part[messageID]?.some((part: Part) => part.type === "text")).toBe(true)
        return Promise.resolve()
      },
    })

    expect(sawOptimisticBeforeProbe).toBe(true)
    expect(sendSawOptimistic).toBe(true)
    expect(store.getState().session_status["session-a"]).toEqual({ type: "busy" })
  })

  test("adds a visible fallback when an accepted prompt goes idle without assistant output", async () => {
    resetScopedMessagesResult()
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    try {
      const store = createStore({})
      const childStores = createChildStores([["/test/project", store]])

      const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
      setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
      setOptimisticRefs(
        ({ sessionID, message, parts }) => {
          store.setState((state) => ({
            message: {
              ...state.message,
              [sessionID]: [...(state.message[sessionID] ?? []), message],
            },
            part: {
              ...state.part,
              [message.id]: parts,
            },
          }))
        },
        ({ sessionID, messageID }) => {
          store.setState((state) => {
            const messages = state.message[sessionID] ?? []
            const nextMessages = messages.filter((message) => message.id !== messageID)
            const nextPart = { ...state.part }
            delete nextPart[messageID]
            return {
              message: {
                ...state.message,
                [sessionID]: nextMessages,
              },
              part: nextPart,
            }
          })
        },
      )

      await optimisticSend({
        sessionId: "session-a",
        content: "hello",
        providerID: "provider",
        modelID: "model",
        send: () => {
          store.setState((state) => ({
            session_status: {
              ...state.session_status,
              "session-a": { type: "idle" as const },
            },
          }))
          return Promise.resolve()
        },
      })

      // The watchdog now verifies against the server before fabricating, so the
      // synthetic fallback is injected after the (empty) refetch resolves.
      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      const messages = store.getState().message["session-a"] ?? []
      const fallback = messages.find((message) => message.role === "assistant")
      expect(fallback).toBeTruthy()
      expect((fallback as Message & { metadata?: Record<string, unknown> } | undefined)?.metadata?.source).toBe("desktop-accepted-prompt-watchdog")
      expect((fallback as Message & { metadata?: Record<string, unknown> } | undefined)?.metadata?.error).toBe(true)
      expect(store.getState().part[fallback?.id ?? ""]?.[0]?.type).toBe("text")
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })

  test("recovers a server-side response instead of fabricating a failure", async () => {
    resetScopedMessagesResult()
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    try {
      const store = createStore({})
      const childStores = createChildStores([["/test/project", store]])

      const { setActionRefs, setOptimisticRefs, optimisticSend } = await import("./session-actions")
      setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
      setOptimisticRefs(
        ({ sessionID, message, parts }) => {
          store.setState((state) => ({
            message: {
              ...state.message,
              [sessionID]: [...(state.message[sessionID] ?? []), message],
            },
            part: {
              ...state.part,
              [message.id]: parts,
            },
          }))
        },
        () => {},
      )

      await optimisticSend({
        sessionId: "session-a",
        content: "hello",
        providerID: "provider",
        modelID: "model",
        send: (messageID) => {
          // Simulate a turn whose streamed events were dropped: the session
          // goes idle locally, but the server actually has the assistant reply.
          scopedMessagesResult = {
            data: [
              { info: { id: messageID, sessionID: "session-a", role: "user", time: { created: 1 } } as unknown as Message, parts: [] },
              {
                info: { id: "msg_assistant", sessionID: "session-a", role: "assistant", parentID: messageID, time: { created: 2, completed: 3 } } as unknown as Message,
                parts: [{ id: "prt_assistant", type: "text", messageID: "msg_assistant", text: "real reply" } as unknown as Part],
              },
            ],
          }
          store.setState((state) => ({
            session_status: {
              ...state.session_status,
              "session-a": { type: "idle" as const },
            },
          }))
          return Promise.resolve()
        },
      })

      await new Promise((resolve) => originalSetTimeout(resolve, 0))

      const messages = store.getState().message["session-a"] ?? []
      const synthetic = messages.find(
        (message) => (message as Message & { metadata?: Record<string, unknown> }).metadata?.source === "desktop-accepted-prompt-watchdog",
      )
      expect(synthetic).toBeFalsy()
      const recovered = messages.find((message) => message.role === "assistant")
      expect(recovered?.id).toBe("msg_assistant")
      expect(store.getState().part["msg_assistant"]?.[0]?.type).toBe("text")
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })
})

describe("optimisticSend: markPromptAccepted is synchronous with busy-set (race condition fix)", () => {
  // Regression test for the bug where 2nd+ prompts always triggered the watchdog.
  //
  // Root cause: markPromptAccepted was called AFTER await input.send(), so any
  // status poll that fired during the connection-wait or POST round-trip saw
  // promptRecentlyAccepted=false and clobbered the optimistic busy→idle.
  //
  // The fix: markPromptAccepted is called synchronously with store.setState({busy}),
  // before any await. This test verifies the invariant holds for 4 consecutive prompts.

  const setupOptimistic = async (store: ReturnType<typeof createStore>) => {
    const childStores = createChildStores([["/test/project", store]])
    const { setActionRefs, setOptimisticRefs, optimisticSend, wasPromptRecentlyAccepted } = await import("./session-actions")
    setActionRefs(mockSdk as unknown as AxCodeClient, childStores, () => "/test/project")
    setOptimisticRefs(
      ({ sessionID, message, parts }) => {
        store.setState((state) => ({
          message: {
            ...state.message,
            [sessionID]: [...(state.message[sessionID] ?? []), message],
          },
          part: { ...state.part, [message.id]: parts },
        }))
      },
      ({ sessionID, messageID }) => {
        store.setState((state) => {
          const messages = state.message[sessionID] ?? []
          const nextPart = { ...state.part }
          delete nextPart[messageID]
          return {
            message: { ...state.message, [sessionID]: messages.filter((m) => m.id !== messageID) },
            part: nextPart,
          }
        })
      },
    )
    return { optimisticSend, wasPromptRecentlyAccepted }
  }

  test("wasPromptRecentlyAccepted is true during the send for all 4 consecutive prompts", async () => {
    const store = createStore({})
    const { optimisticSend, wasPromptRecentlyAccepted } = await setupOptimistic(store)

    for (let i = 0; i < 4; i++) {
      // Simulate a completed turn: session goes back to idle with a finished assistant reply.
      store.setState((state) => ({
        session_status: { ...state.session_status, "session-a": { type: "idle" as const } },
        message: {
          ...state.message,
          "session-a": [
            {
              id: `prev-assistant-${i}`,
              role: "assistant",
              sessionID: "session-a",
              time: { created: 1, completed: 2 },
            } as unknown as Message,
          ],
        },
      }))

      let acceptedDuringSend = false
      let pollResultDuringSend: ReturnType<typeof resolveResyncedSessionStatus> | undefined

      await optimisticSend({
        sessionId: "session-a",
        content: `prompt ${i + 1}`,
        providerID: "provider",
        modelID: "model",
        send: async () => {
          // This callback fires while awaiting the POST — the exact window the
          // periodic status poll can fire. Verify our invariants hold here.
          acceptedDuringSend = wasPromptRecentlyAccepted("session-a")

          // Simulate the status poll calling resolveResyncedSessionStatus with
          // serverStatus=undefined (ax-code hasn't registered the session yet).
          const state = store.getState()
          pollResultDuringSend = resolveResyncedSessionStatus({
            serverStatus: undefined,
            existingStatus: state.session_status?.["session-a"],
            promptRecentlyAccepted: wasPromptRecentlyAccepted("session-a"),
            hasCompletedAssistantReply: hasCompletedAssistantReply(state.message?.["session-a"]),
          })
        },
      })

      expect(acceptedDuringSend).toBe(true)
      expect(pollResultDuringSend).toEqual({ type: "busy" })
      expect(store.getState().session_status?.["session-a"]).toEqual({ type: "busy" })
    }
  })
})
