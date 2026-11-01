import { expect, test, vi } from "vitest"
import type { Event, Message, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { ChildStoreManager } from "./child-store"
import { applyDirectoryEvent, prepareEventDraft } from "./event-reducer"
import { DIR_IDLE_TTL_MS, MAX_DIR_STORES } from "./types"

const protectedReads = vi.hoisted(() => ({ count: 0, record: false }))
const identityCalls = vi.hoisted(() => ({ paths: [] as string[], record: false }))

vi.mock("./session-cache", async (importOriginal) => {
  const original = await importOriginal<typeof import("./session-cache")>()
  return {
    ...original,
    getProtectedSessionCacheIds: (store: Parameters<typeof original.getProtectedSessionCacheIds>[0]) => {
      if (protectedReads.record) protectedReads.count += 1
      return original.getProtectedSessionCacheIds(store)
    },
  }
})

vi.mock("@/lib/projectResolution", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/projectResolution")>()
  return {
    ...original,
    getProjectPathIdentityKey: (value?: string | null) => {
      if (identityCalls.record && typeof value === "string") identityCalls.paths.push(value)
      return original.getProjectPathIdentityKey(value)
    },
  }
})

test.each([
  ["C:/Users/RunnerAdmin/Project", "c:\\users\\runneradmin\\project"],
  ["//Server/Share/Project", "\\\\server\\share\\project"],
])("Windows aliases share one message cache and archive lifecycle: %s", (directory, alias) => {
  const manager = new ChildStoreManager()
  const first = manager.ensureChild(directory, { bootstrap: false })
  first.setState({ message: { session: [] }, sessionTotal: 3 })
  const second = manager.ensureChild(alias, { bootstrap: false })
  expect(second).toBe(first)
  expect(manager.children.size).toBe(1)
  manager.update(alias, () => ({ sessionTotal: 0 }))
  expect(manager.getState(directory)?.sessionTotal).toBe(0)
  manager.pin(alias)
  expect(manager.pinned(directory)).toBe(true)
  expect(manager.disposeDirectory(directory)).toBe(false)
  manager.unpin(directory)
  expect(manager.disposeDirectory(alias)).toBe(true)
  expect(manager.getChild(directory)).toBeUndefined()
})

test("POSIX directories with different case remain separate", () => {
  const manager = new ChildStoreManager()
  expect(manager.ensureChild("/Repo", { bootstrap: false })).not.toBe(manager.ensureChild("/repo", { bootstrap: false }))
  expect(manager.children.size).toBe(2)
})


test("a review opened under a Windows alias retains earlier calls and sees archive events", () => {
  const manager = new ChildStoreManager()
  const directory = "C:/Users/RunnerAdmin/Project"
  const alias = directory.toLowerCase()
  const store = manager.ensureChild(directory, { bootstrap: false })
  const message: Message = {
    id: "msg_1", sessionID: "ses_1", role: "user", time: { created: 1 },
    agent: "build", model: { providerID: "fixture", modelID: "fixture" },
  }
  const session = { id: "ses_1", directory, time: { created: 1, updated: 1 } } as Session
  store.setState({ session: [session], message: { ses_1: [message] } })
  const review = manager.ensureChild(alias, { bootstrap: false })
  expect(review.getState().message.ses_1).toEqual([message])
  const event: Event = { type: "session.updated", properties: {
    info: { ...session, time: { created: 1, updated: 2, archived: 2 } },
  } }
  manager.update(alias, state => {
    const draft = prepareEventDraft(state, event)
    applyDirectoryEvent(draft, event)
    return draft
  })
  expect(store.getState().session).toEqual([])
  expect(Array.from(manager.children.values()).flatMap(child => child.getState().session)).toEqual([])
})

test("thirty flushes do not evict, the interval still applies the TTL, and the 31st directory frees a slot", () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_700_000_000_000)
  const manager = new ChildStoreManager()
  try {
    manager.ensureChild("/pinned", { bootstrap: false })
    manager.pin("/pinned")
    manager.ensureChild("/idle", { bootstrap: false })
    protectedReads.count = 0
    protectedReads.record = true
    for (let flush = 0; flush < 30; flush += 1) manager.mark("/pinned")
    expect(manager.getChild("/idle")).toBeDefined()
    expect(manager.getChild("/pinned")).toBeDefined()
    expect(protectedReads.count).toBe(0)
    protectedReads.record = false

    vi.setSystemTime(Date.now() + DIR_IDLE_TTL_MS)
    manager.mark("/pinned")
    expect(manager.getChild("/idle")).toBeDefined()
    manager.runEviction()
    expect(manager.getChild("/idle")).toBeUndefined()
    expect(manager.getChild("/pinned")).toBeDefined()

    const idle: string[] = []
    for (let index = 0; index < MAX_DIR_STORES - 1; index += 1) {
      vi.setSystemTime(Date.now() + 1)
      const directory = `/idle/${index}`
      idle.push(directory)
      manager.ensureChild(directory, { bootstrap: false })
    }
    expect(manager.children.size).toBe(MAX_DIR_STORES)
    vi.setSystemTime(Date.now() + 1)
    const overflow = manager.ensureChild("/overflow", { bootstrap: false })
    expect(manager.children.size).toBe(MAX_DIR_STORES)
    expect(manager.getChild(idle[0])).toBeUndefined()
    expect(manager.getChild("/pinned")).toBeDefined()
    expect(manager.getChild("/overflow")).toBe(overflow)
    expect(manager.pinned("/pinned")).toBe(true)
  } finally {
    protectedReads.record = false
    manager.disposeAll()
    vi.useRealTimers()
  }
})

test("Windows spellings resolve without scanning other children, and disposing one removes both", () => {
  const manager = new ChildStoreManager()
  const siblings: string[] = []
  for (let index = 0; index < 6; index += 1) {
    const directory = `C:/Other/Project${index}`
    siblings.push(directory)
    manager.ensureChild(directory, { bootstrap: false })
  }
  const canonical = "C:/Users/RunnerAdmin/Project"
  const alias = "c:\\users\\runneradmin\\project"
  const store = manager.ensureChild(canonical, { bootstrap: false })
  expect(manager.ensureChild(alias, { bootstrap: false })).toBe(store)
  expect(manager.children.size).toBe(siblings.length + 1)

  identityCalls.paths = []
  identityCalls.record = true
  try {
    expect(manager.getChild(alias)).toBe(store)
    expect(manager.getChild(canonical)).toBe(store)
    expect(manager.getChild(alias)).toBe(store)
    expect(identityCalls.paths).toEqual([alias, alias])
    for (const sibling of siblings) expect(identityCalls.paths).not.toContain(sibling)
    expect(identityCalls.paths).not.toContain(canonical)

    expect(manager.disposeDirectory(alias)).toBe(true)
    expect(manager.getChild(canonical)).toBeUndefined()
    expect(manager.getChild(alias)).toBeUndefined()
    expect(manager.children.has(canonical)).toBe(false)

    // A fresh store after a dispose, and again after disposeAll, is indexed for both spellings.
    const recreated = manager.ensureChild(alias, { bootstrap: false })
    expect(recreated).not.toBe(store)
    expect(manager.getChild(canonical)).toBe(recreated)
    manager.disposeAll()
    const afterAll = manager.ensureChild(canonical, { bootstrap: false })
    expect(afterAll).not.toBe(recreated)
    expect(manager.getChild(alias)).toBe(afterAll)
  } finally {
    identityCalls.record = false
    manager.disposeAll()
  }
})
