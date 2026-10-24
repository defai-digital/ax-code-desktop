import { weakRef } from "@/lib/weakRef"
import type { ChatMessageEntry } from "../lib/turns/types"
import type { TurnWindowModel } from "../lib/turns/windowTurns"

const TURN_MODEL_CACHE_MAX = 30

// The cache is module-level, so a strong reference to the message array would keep an
// evicted directory's whole transcript alive. The model only holds ids; the array is weak.
const turnModelCache = new Map<string, { messages: WeakRef<ChatMessageEntry[]>; model: TurnWindowModel }>()

export const rememberTurnModel = (key: string, messages: ChatMessageEntry[], model: TurnWindowModel) => {
  turnModelCache.delete(key)
  while (turnModelCache.size >= TURN_MODEL_CACHE_MAX) {
    const oldest = turnModelCache.keys().next().value
    if (typeof oldest !== "string") break
    turnModelCache.delete(oldest)
  }
  turnModelCache.set(key, { messages: weakRef(messages), model })
}

/** The remembered model when it was built from exactly this message array. */
export const recallTurnModel = (key: string, messages: ChatMessageEntry[]): TurnWindowModel | undefined => {
  const cached = turnModelCache.get(key)
  if (!cached) return undefined
  if (cached.messages.deref() !== messages) return undefined
  rememberTurnModel(key, messages, cached.model)
  return cached.model
}

export const clearTurnModelCache = () => turnModelCache.clear()
