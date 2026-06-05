import { describe, expect, test, beforeEach, mock } from "bun:test"
import type { PermissionRequest } from "@/types/permission"
import type { Message, Part } from "@ax-code/sdk/v2/client"

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

const mockScopedClient = {
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
})
