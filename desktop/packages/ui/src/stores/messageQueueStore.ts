import { create } from "zustand"
import { devtools, persist, createJSONStorage } from "zustand/middleware"
import { getSafeStorage } from "./utils/safeStorage"
import type { AttachedFile } from "./types/sessionTypes"
import { updateDesktopSettings } from "@/lib/persistence"
import { ascendingId } from "@/lib/ax-code/client"

export interface QueuedMessage {
  id: string
  content: string
  attachments?: AttachedFile[]
  createdAt: number
  /**
   * Stable id for this entry's prompt. Minted when the entry is queued and reused on
   * every send attempt, so a retry after a failed or ambiguous send is deduplicated by
   * the server (which uses it as the real user message id) instead of delivering the
   * same queued message twice. Entries persisted before this field exist without it.
   */
  messageId?: string
  /** Send config captured at queue time — used as-is when auto-sending */
  sendConfig?: {
    providerID: string
    modelID: string
    agent?: string
    variant?: string
  }
}

interface MessageQueueState {
  queuedMessages: Record<string, QueuedMessage[]> // sessionId → queue
  queueModeEnabled: boolean // global toggle
}

interface MessageQueueActions {
  addToQueue: (sessionId: string, message: Omit<QueuedMessage, "id" | "createdAt">) => void
  removeFromQueue: (sessionId: string, messageId: string) => void
  popToInput: (sessionId: string, messageId: string) => QueuedMessage | null
  clearQueue: (sessionId: string) => void
  /** Drop queues for deleted sessions so persisted storage stays bounded. */
  clearSessions: (sessionIds: Iterable<string>) => void
  clearAllQueues: () => void
  setQueueMode: (enabled: boolean) => void
  getQueueForSession: (sessionId: string) => QueuedMessage[]
}

type MessageQueueStore = MessageQueueState & MessageQueueActions

/** Cap per-session queue length to bound localStorage / memory growth (STAB-12). */
export const MESSAGE_QUEUE_MAX_PER_SESSION = 50

const QUEUE_STORAGE_KEY = "message-queue-store"
const DISPATCH_CLAIM_PREFIX = "oc.queue.dispatch."
// Long enough to cover the gap until the other window notices the removal through
// its storage event, short enough that a stale claim cannot block a real retry.
const DISPATCH_CLAIM_TTL_MS = 60_000

/**
 * Cross-window claim for one queued entry. Both windows can see the same busy → idle
 * edge and each would dispatch the entry; the first to claim it sends, the other
 * skips. Expired claims are pruned on the way through so the keys stay bounded.
 */
export const claimQueuedDispatch = (messageId: string): boolean => {
  if (typeof window === "undefined") return true
  try {
    const storage = window.localStorage
    const now = Date.now()
    const expired: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !key.startsWith(DISPATCH_CLAIM_PREFIX)) continue
      const claimedAt = Number(storage.getItem(key))
      if (!Number.isFinite(claimedAt) || now - claimedAt >= DISPATCH_CLAIM_TTL_MS) expired.push(key)
    }
    for (const key of expired) storage.removeItem(key)

    const key = `${DISPATCH_CLAIM_PREFIX}${messageId}`
    const existing = storage.getItem(key)
    if (existing !== null && now - Number(existing) < DISPATCH_CLAIM_TTL_MS) return false
    storage.setItem(key, String(now))
    return true
  } catch {
    // Storage unavailable: behave as before (single-window assumption).
    return true
  }
}

export const releaseQueuedDispatchClaim = (messageId: string): void => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(`${DISPATCH_CLAIM_PREFIX}${messageId}`)
  } catch {
    /* ignore */
  }
}

export const useMessageQueueStore = create<MessageQueueStore>()(
  devtools(
    persist(
      (set, get) => ({
        queuedMessages: {},
        queueModeEnabled: true,

        addToQueue: (sessionId, message) => {
          const id = `queued-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
          const queuedMessage: QueuedMessage = {
            id,
            messageId: ascendingId("msg"),
            content: message.content,
            attachments: message.attachments,
            createdAt: Date.now(),
            sendConfig: message.sendConfig,
          }

          set((state) => {
            const currentQueue = state.queuedMessages[sessionId] ?? []
            const nextQueue = [...currentQueue, queuedMessage]
            // Drop oldest when over cap so a runaway queue cannot bloat storage.
            const capped =
              nextQueue.length > MESSAGE_QUEUE_MAX_PER_SESSION
                ? nextQueue.slice(nextQueue.length - MESSAGE_QUEUE_MAX_PER_SESSION)
                : nextQueue
            return {
              queuedMessages: {
                ...state.queuedMessages,
                [sessionId]: capped,
              },
            }
          })
        },

        removeFromQueue: (sessionId, messageId) => {
          set((state) => {
            const currentQueue = state.queuedMessages[sessionId] ?? []
            const newQueue = currentQueue.filter((m) => m.id !== messageId)

            if (newQueue.length === 0) {
              const { [sessionId]: _removed, ...rest } = state.queuedMessages
              void _removed
              return { queuedMessages: rest }
            }

            return {
              queuedMessages: {
                ...state.queuedMessages,
                [sessionId]: newQueue,
              },
            }
          })
        },

        popToInput: (sessionId, messageId) => {
          const state = get()
          const currentQueue = state.queuedMessages[sessionId] ?? []
          const message = currentQueue.find((m) => m.id === messageId)

          if (!message) {
            return null
          }

          // Remove from queue
          set((prevState) => {
            const queue = prevState.queuedMessages[sessionId] ?? []
            const newQueue = queue.filter((m) => m.id !== messageId)

            if (newQueue.length === 0) {
              const { [sessionId]: _removed, ...rest } = prevState.queuedMessages
              void _removed
              return { queuedMessages: rest }
            }

            return {
              queuedMessages: {
                ...prevState.queuedMessages,
                [sessionId]: newQueue,
              },
            }
          })

          return message
        },

        clearQueue: (sessionId) => {
          set((state) => {
            const { [sessionId]: _removed, ...rest } = state.queuedMessages
            void _removed
            return { queuedMessages: rest }
          })
        },

        clearSessions: (sessionIds) => {
          const idSet = sessionIds instanceof Set ? sessionIds : new Set(sessionIds)
          if (idSet.size === 0) return
          set((state) => {
            let changed = false
            const queuedMessages = { ...state.queuedMessages }
            for (const sessionId of idSet) {
              if (sessionId in queuedMessages) {
                delete queuedMessages[sessionId]
                changed = true
              }
            }
            return changed ? { queuedMessages } : state
          })
        },

        clearAllQueues: () => {
          set({ queuedMessages: {} })
        },

        setQueueMode: (enabled) => {
          set({ queueModeEnabled: enabled })
          // Persist to settings.json (async, fire-and-forget)
          void updateDesktopSettings({ queueModeEnabled: enabled })
        },

        getQueueForSession: (sessionId) => {
          return get().queuedMessages[sessionId] ?? []
        },
      }),
      {
        name: "message-queue-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          queuedMessages: state.queuedMessages,
          queueModeEnabled: state.queueModeEnabled,
        }),
      },
    ),
    {
      name: "message-queue-store",
    },
  ),
)

// The queue is a shared, persisted resource: a removal in one window must reach the
// other, or the other window keeps a stale entry and dispatches it again. Storage
// events only fire in the *other* windows, so this cannot loop.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== QUEUE_STORAGE_KEY) return
    void useMessageQueueStore.persist.rehydrate()
  })
}
