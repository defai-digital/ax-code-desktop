import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Message } from "@defai-digital/ax-code-sdk/v2/client"
import { ChildStoreManager } from "./child-store"
import { SESSION_CACHE_LIMIT } from "./types"

const directory = "/workspace/recreated"
const messages = () =>
  Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [
      `ses_${i}`,
      [{ id: `msg_${i}`, sessionID: `ses_${i}`, role: "assistant", time: { created: i, completed: i + 1 } } as Message],
    ]),
  )
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

test("a registry observer can recreate a disposed directory without losing its retention subscription", () => {
  const manager = new ChildStoreManager()
  const original = manager.ensureChild(directory, { bootstrap: false })
  const unsubscribe = manager.subscribeRegistry(() => {
    if (!manager.getChild(directory)) manager.ensureChild(directory, { bootstrap: false })
  })
  try {
    expect(manager.disposeDirectory(directory)).toBe(true)
    const replacement = manager.getChild(directory)!
    expect(replacement).not.toBe(original)
    replacement.setState({ message: messages() })
    vi.advanceTimersByTime(1000)
    expect(Object.keys(replacement.getState().message)).toHaveLength(SESSION_CACHE_LIMIT)
  } finally {
    unsubscribe()
    manager.disposeAll()
  }
})

test("disposeAll preserves ownership of subscriptions installed by a registry observer", () => {
  const manager = new ChildStoreManager()
  manager.ensureChild(directory, { bootstrap: false })
  const unsubscribe = manager.subscribeRegistry(() => {
    if (!manager.getChild(directory)) manager.ensureChild(directory, { bootstrap: false })
  })
  manager.disposeAll()
  const replacement = manager.getChild(directory)!
  unsubscribe()
  manager.disposeAll()
  replacement.setState({ message: messages() })
  expect(vi.getTimerCount()).toBe(0)
})
