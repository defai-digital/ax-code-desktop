import { describe, expect, test, vi } from "vitest"
import { INITIAL_STATE, type State } from "@/sync/types"
import { loadAllSessionRecords, type SessionRecordsSync } from "./sessionExportRecords"

type MessageStub = { id: string; role: "user" | "assistant" }

// A store whose state is the real initial one plus the messages this test put there, so the snapshot
// builder reads exactly what it reads in production.
const storeWith = (messages: Record<string, MessageStub[]>) =>
  ({
    getState: () => ({ ...INITIAL_STATE, message: messages }) as unknown as State,
  }) as unknown as Parameters<typeof loadAllSessionRecords>[0]["store"]

const message = (id: string) => ({ id, role: "assistant" as const })

const syncFor = (pages: string[][]): SessionRecordsSync & { loadMore: ReturnType<typeof vi.fn> } => {
  let page = 0
  return {
    ensureSessionRenderable: vi.fn(async () => {}),
    hasMore: () => page < pages.length,
    loadMore: vi.fn(async (sessionId: string) => {
      const next = pages[page] ?? []
      page += 1
      for (const id of next) {
        const existing = store.message[sessionId] ?? []
        store.message[sessionId] = [message(id), ...existing]
      }
    }),
  }
}

// Shared with the fake above so a "page" can land in the same place the snapshot reads.
const store = { message: {} as Record<string, { id: string; role: "user" | "assistant" }[]> }

describe("loadAllSessionRecords", () => {
  test("drains the pages a session still has, not just the first one", async () => {
    // The initial sync loads one page and leaves a cursor. Reading the snapshot right after it
    // exported a long session short, with the UI reporting success.
    store.message = { ses_1: [message("msg_page_1")] }
    const sync = syncFor([["msg_page_2"], ["msg_page_3"]])

    const records = await loadAllSessionRecords({ sessionId: "ses_1", store: storeWith(store.message), sync })

    expect(records.map((record) => record.info.id)).toEqual(["msg_page_3", "msg_page_2", "msg_page_1"])
    expect(sync.loadMore).toHaveBeenCalledTimes(2)
  })

  test("stops when a page adds nothing", async () => {
    // A server that keeps reporting more without handing back a new page must not spin this loop.
    store.message = { ses_2: [message("msg_only")] }
    const sync = syncFor([[], [], []])

    const records = await loadAllSessionRecords({ sessionId: "ses_2", store: storeWith(store.message), sync })

    expect(records.map((record) => record.info.id)).toEqual(["msg_only"])
    expect(sync.loadMore).toHaveBeenCalledTimes(1)
  })
})
