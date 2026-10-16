import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const loadStore = async () => {
  vi.resetModules()
  return await import("./useSessionFoldersStore")
}

describe("session folders disk flush", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => null }))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("refuses a folder map whose entries are not arrays", async () => {
    // The disk path accepted any object: `{"foldersMap":{"/p":"oops"}}` — a hand edit, or a file an older
    // writer produced — reached the store, and `getFoldersForScope` handed a string to callers that map over
    // it. The localStorage path has always validated every entry; both go through one reader now.
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        foldersMap: { "/p": "oops", "/ok": [{ id: "f1", name: "Flights" }] },
        collapsedFolderIds: [],
      }),
    }))

    const { useSessionFoldersStore } = await loadStore()
    await vi.waitFor(() => {
      expect(useSessionFoldersStore.getState().foldersMap["/ok"]).toHaveLength(1)
    })

    expect(Array.isArray(useSessionFoldersStore.getState().getFoldersForScope("/p"))).toBe(true)
  })

  test("flushes the debounced disk write when the page unloads", async () => {
    const { useSessionFoldersStore } = await loadStore()
    fetchMock.mockClear()

    useSessionFoldersStore.getState().createFolder("scope-1", "Flights")

    // Still inside the debounce window: nothing has reached the disk yet.
    const postsBeforeUnload = fetchMock.mock.calls.filter(([, init]) => (init as { method?: string })?.method === "POST")
    expect(postsBeforeUnload).toHaveLength(0)

    window.dispatchEvent(new Event("beforeunload"))

    const posts = fetchMock.mock.calls.filter(([, init]) => (init as { method?: string })?.method === "POST")
    expect(posts).toHaveLength(1)
    const init = posts[0][1] as { body: string; keepalive?: boolean }
    // keepalive keeps the request alive past the page teardown; without the flush
    // the disk copy lags localStorage and the next launch hydrates the old state.
    expect(init.keepalive).toBe(true)
    expect(init.body).toContain("Flights")
  })

  test("keeps the disk write after the debounce window when the page stays open", async () => {
    vi.useFakeTimers()
    try {
      const { useSessionFoldersStore } = await loadStore()
      fetchMock.mockClear()

      useSessionFoldersStore.getState().createFolder("scope-1", "Flights")
      await vi.advanceTimersByTimeAsync(250)

      const posts = fetchMock.mock.calls.filter(
        ([, init]) => (init as { method?: string })?.method === "POST",
      ) as Array<[string, { keepalive?: boolean }]>
      expect(posts).toHaveLength(1)
      expect(posts[0][1].keepalive).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
