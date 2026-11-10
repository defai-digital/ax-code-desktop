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

const folder = (id: string, name = id, sessionIds: string[] = [], parentId: string | null = null) => ({
  id,
  name,
  sessionIds,
  createdAt: 1,
  parentId,
})

describe("mergeSessionFolderSnapshots", () => {
  test("keeps another window's rename and creation alongside this window's edits", async () => {
    const { mergeSessionFolderSnapshots } = await loadStore()
    const base = { foldersMap: { "/p": [folder("a", "A"), folder("b", "B")] }, collapsedFolderIds: [] }
    const local = { foldersMap: { "/p": [folder("a", "A"), folder("b", "B mine"), folder("c", "C")] }, collapsedFolderIds: [] }
    const remote = {
      foldersMap: { "/p": [folder("a", "A theirs"), folder("b", "B"), folder("d", "D")] },
      collapsedFolderIds: [],
    }

    const merged = mergeSessionFolderSnapshots(base, local, remote)

    expect(merged.foldersMap["/p"].map((entry) => [entry.id, entry.name])).toEqual([
      ["a", "A theirs"],
      ["b", "B mine"],
      ["d", "D"],
      ["c", "C"],
    ])
  })

  test("applies deletions from either side, and keeps a folder this window edited", async () => {
    const { mergeSessionFolderSnapshots } = await loadStore()
    const base = { foldersMap: { "/p": [folder("a"), folder("b"), folder("c")] }, collapsedFolderIds: [] }
    const local = { foldersMap: { "/p": [folder("b"), folder("c", "C edited")] }, collapsedFolderIds: [] }
    const remote = { foldersMap: { "/p": [folder("a"), folder("b")] }, collapsedFolderIds: [] }

    const merged = mergeSessionFolderSnapshots(base, local, remote)

    expect(merged.foldersMap["/p"].map((entry) => entry.id)).toEqual(["b", "c"])
  })

  test("keeps a session in one folder, preferring this window's move", async () => {
    const { mergeSessionFolderSnapshots } = await loadStore()
    const base = { foldersMap: { "/p": [folder("a"), folder("b")] }, collapsedFolderIds: [] }
    const local = { foldersMap: { "/p": [folder("a", "a", ["s1"]), folder("b")] }, collapsedFolderIds: [] }
    const remote = { foldersMap: { "/p": [folder("a"), folder("b", "b", ["s1"])] }, collapsedFolderIds: [] }

    const merged = mergeSessionFolderSnapshots(base, local, remote)

    expect(merged.foldersMap["/p"].map((entry) => [entry.id, entry.sessionIds])).toEqual([
      ["a", ["s1"]],
      ["b", []],
    ])
  })

  test("moves a sub-folder to the top level when the other side deleted its parent", async () => {
    const { mergeSessionFolderSnapshots } = await loadStore()
    const base = { foldersMap: { "/p": [folder("parent")] }, collapsedFolderIds: [] }
    const local = { foldersMap: { "/p": [] }, collapsedFolderIds: [] }
    const remote = { foldersMap: { "/p": [folder("parent"), folder("child", "child", [], "parent")] }, collapsedFolderIds: [] }

    const merged = mergeSessionFolderSnapshots(base, local, remote)

    expect(merged.foldersMap["/p"]).toEqual([folder("child")])
  })

  test("merges collapsed state per folder", async () => {
    const { mergeSessionFolderSnapshots } = await loadStore()
    const folders = { "/p": [folder("a"), folder("b"), folder("c")] }
    const merged = mergeSessionFolderSnapshots(
      { foldersMap: folders, collapsedFolderIds: ["a"] },
      { foldersMap: folders, collapsedFolderIds: ["b"] },
      { foldersMap: folders, collapsedFolderIds: ["a", "c"] },
    )
    // This window expanded a and collapsed b; the other window collapsed c.
    expect(merged.collapsedFolderIds.sort()).toEqual(["b", "c"])
  })
})

describe("session folders revision sync", () => {
  type FetchInit = { method?: string; body?: string }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // The store boots from localStorage; an earlier test's folders must not leak in.
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const jsonResponse = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
  const postBodies = () =>
    fetchMock.mock.calls
      .filter(([, init]) => (init as FetchInit | undefined)?.method === "POST")
      .map(([, init]) => JSON.parse((init as FetchInit).body as string))

  test("merges into the newer file and writes again when another window saved first", async () => {
    vi.useFakeTimers()
    const postResponses = [
      jsonResponse(409, {
        error: "changed",
        current: {
          version: 1,
          revision: 4,
          foldersMap: { "/p": [folder("a", "Renamed elsewhere")] },
          collapsedFolderIds: [],
        },
      }),
      jsonResponse(200, { success: true, revision: 5 }),
    ]
    fetchMock = vi.fn(async (_url: string, init?: FetchInit) => {
      if (init?.method === "POST") return postResponses.shift() ?? jsonResponse(200, { success: true, revision: 6 })
      return jsonResponse(200, { version: 1, revision: 3, foldersMap: { "/p": [folder("a", "A")] }, collapsedFolderIds: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { useSessionFoldersStore } = await loadStore()
    await vi.waitFor(() => expect(useSessionFoldersStore.getState().foldersMap["/p"]).toHaveLength(1))

    useSessionFoldersStore.getState().createFolder("/p", "Mine")
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(postBodies()).toHaveLength(2))

    const [first, second] = postBodies()
    expect(first.baseRevision).toBe(3)
    expect(second.baseRevision).toBe(4)
    expect(second.foldersMap["/p"].map((entry: { name: string }) => entry.name)).toEqual(["Renamed elsewhere", "Mine"])
    expect(useSessionFoldersStore.getState().foldersMap["/p"].map((entry) => entry.name)).toEqual([
      "Renamed elsewhere",
      "Mine",
    ])

    // The next edit builds on the revision the retry saved.
    useSessionFoldersStore.getState().createFolder("/p", "Another")
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(postBodies()).toHaveLength(3))
    expect(postBodies()[2].baseRevision).toBe(5)
  })

  test("retries a write the server failed instead of dropping it", async () => {
    vi.useFakeTimers()
    const postResponses = [jsonResponse(500, { error: "disk full" }), jsonResponse(200, { success: true, revision: 2 })]
    fetchMock = vi.fn(async (_url: string, init?: FetchInit) => {
      if (init?.method === "POST") return postResponses.shift() ?? jsonResponse(200, { success: true, revision: 3 })
      return jsonResponse(200, { version: 1, revision: 1, foldersMap: {}, collapsedFolderIds: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { useSessionFoldersStore } = await loadStore()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    useSessionFoldersStore.getState().createFolder("/p", "Flights")
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(postBodies()).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(postBodies()).toHaveLength(2))
    expect(postBodies()[1].foldersMap["/p"][0].name).toBe("Flights")
    expect(postBodies()[1].baseRevision).toBe(1)
  })
})
