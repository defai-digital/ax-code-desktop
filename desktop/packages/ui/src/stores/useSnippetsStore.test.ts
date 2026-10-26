import { beforeEach, describe, expect, test, vi } from "vitest"

let activeProjectPath = "/workspace/project"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const fetchCalls: Array<RequestInfo | URL> = []
let queuedResponses: Array<Response | Promise<Response>> = []

vi.doMock("@/stores/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({
      getActiveProject: () => ({ path: activeProjectPath }),
    }),
  },
}))

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => "/fallback/project",
  },
}))

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

const snippet = (name: string, project: string) => ({
  name,
  content: `${name} body`,
  aliases: [],
  filePath: `/workspace/${project}/snippets/${name}.md`,
  source: "project" as const,
})

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  fetchCalls.push(input)
  return queuedResponses.shift() ?? jsonResponse([])
})

const loadStore = async () => {
  const { useSnippetsStore } = await import("./useSnippetsStore")
  return useSnippetsStore
}

describe("useSnippetsStore", () => {
  beforeEach(() => {
    vi.resetModules()
    activeProjectPath = "/workspace/project"
    fetchCalls.length = 0
    queuedResponses = []
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockClear()
  })

  test("loads fresh snippets when the active project directory changes inside the cache TTL", async () => {
    queuedResponses = [
      jsonResponse([snippet("old-snippet", "old-project")]),
      jsonResponse([snippet("new-snippet", "new-project")]),
    ]

    const useSnippetsStore = await loadStore()

    activeProjectPath = "/workspace/old-project"
    await useSnippetsStore.getState().loadSnippets()
    expect(useSnippetsStore.getState().snippets).toEqual([snippet("old-snippet", "old-project")])

    activeProjectPath = "/workspace/new-project"
    await useSnippetsStore.getState().loadSnippets()

    expect(fetchCalls.map(String)).toEqual([
      "/api/config/snippets?directory=%2Fworkspace%2Fold-project",
      "/api/config/snippets?directory=%2Fworkspace%2Fnew-project",
    ])
    expect(useSnippetsStore.getState().snippets).toEqual([snippet("new-snippet", "new-project")])
    expect(useSnippetsStore.getState().isLoading).toBe(false)
  })

  test("does not share in-flight snippet loads across project directories", async () => {
    const staleSnippets = createDeferred<Response>()
    const latestSnippets = createDeferred<Response>()
    queuedResponses = [staleSnippets.promise, latestSnippets.promise]

    const useSnippetsStore = await loadStore()

    activeProjectPath = "/workspace/old-project"
    const oldLoad = useSnippetsStore.getState().loadSnippets()
    activeProjectPath = "/workspace/new-project"
    const newLoad = useSnippetsStore.getState().loadSnippets()
    await Promise.resolve()

    expect(fetchCalls.map(String)).toEqual([
      "/api/config/snippets?directory=%2Fworkspace%2Fold-project",
      "/api/config/snippets?directory=%2Fworkspace%2Fnew-project",
    ])

    latestSnippets.resolve(jsonResponse([snippet("new-snippet", "new-project")]))
    await newLoad

    staleSnippets.resolve(jsonResponse([snippet("old-snippet", "old-project")]))
    await oldLoad

    expect(useSnippetsStore.getState().snippets).toEqual([snippet("new-snippet", "new-project")])
    expect(useSnippetsStore.getState().isLoading).toBe(false)
  })

  test("publishes the load for the directory that was requested last", async () => {
    const firstLoad = createDeferred<Response>()
    const secondLoad = createDeferred<Response>()
    queuedResponses = [firstLoad.promise, secondLoad.promise]

    const useSnippetsStore = await loadStore()

    activeProjectPath = "/workspace/project-a"
    const loadA = useSnippetsStore.getState().loadSnippets()
    activeProjectPath = "/workspace/project-b"
    const loadB = useSnippetsStore.getState().loadSnippets()
    await Promise.resolve()

    // Back to A before either answer lands: this joins A's in-flight load instead of starting a third
    // request, and it is what makes A the requested directory again.
    activeProjectPath = "/workspace/project-a"
    const loadABack = useSnippetsStore.getState().loadSnippets()
    await Promise.resolve()

    expect(fetchCalls.map(String)).toEqual([
      "/api/config/snippets?directory=%2Fworkspace%2Fproject-a",
      "/api/config/snippets?directory=%2Fworkspace%2Fproject-b",
    ])

    secondLoad.resolve(jsonResponse([snippet("b-snippet", "project-b")]))
    await loadB
    // The newest request is for A, so B's answer is the one that must not be published.
    expect(useSnippetsStore.getState().snippets).toEqual([])

    firstLoad.resolve(jsonResponse([snippet("a-snippet", "project-a")]))
    await loadA
    await loadABack

    expect(useSnippetsStore.getState().snippets).toEqual([snippet("a-snippet", "project-a")])
    expect(useSnippetsStore.getState().isLoading).toBe(false)
  })
})

describe("snippets working-set retention", () => {
  beforeEach(() => {
    vi.resetModules()
    activeProjectPath = "/workspace/project"
    fetchCalls.length = 0
    queuedResponses = []
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockClear()
  })

  test("evicts old project payloads while preserving recent cached projects", async () => {
    const store = await loadStore()
    for (let i = 0; i < 50; i++) {
      activeProjectPath = `/workspace/visited-${i}`
      queuedResponses.push(jsonResponse([snippet(`snippet-${i}`, `visited-${i}`)]))
      await store.getState().loadSnippets()
    }
    activeProjectPath = "/workspace/visited-49"
    await store.getState().loadSnippets()
    expect(fetchCalls).toHaveLength(50)
    expect(store.getState().snippets[0]?.name).toBe("snippet-49")
    activeProjectPath = "/workspace/visited-0"
    const response = createDeferred<Response>()
    queuedResponses.push(response.promise)
    const reload = store.getState().loadSnippets()
    expect(store.getState().snippets).toEqual([])
    response.resolve(jsonResponse([snippet("reloaded", "visited-0")]))
    await reload
    expect(store.getState().snippets[0]?.name).toBe("reloaded")
  })

  test("does not retain an oversized snapshot as a hidden project cache", async () => {
    const store = await loadStore()
    const oversized = { ...snippet("large", "large"), content: "x".repeat(11 * 1024 * 1024) }
    queuedResponses.push(jsonResponse([oversized]))
    await store.getState().loadSnippets()
    activeProjectPath = "/workspace/other"
    queuedResponses.push(jsonResponse([]))
    await store.getState().loadSnippets()
    activeProjectPath = "/workspace/project"
    queuedResponses.push(jsonResponse([snippet("fresh", "fresh")]))
    await store.getState().loadSnippets()
    expect(fetchCalls).toHaveLength(3)
    expect(store.getState().snippets[0]?.name).toBe("fresh")
  })

  test("a failed load releases ownership so retry succeeds", async () => {
    const store = await loadStore()
    queuedResponses.push(new Response("failure", { status: 503 }), jsonResponse([snippet("retry", "project")]))
    expect(await store.getState().loadSnippets()).toBe(false)
    expect(await store.getState().loadSnippets()).toBe(true)
    expect(store.getState().snippets[0]?.name).toBe("retry")
  })
  test("switching back to an in-flight project clears foreign snippets even when the load fails", async () => {
    const store = await loadStore()
    const first = createDeferred<Response>()
    activeProjectPath = "/workspace/project-a"
    queuedResponses.push(first.promise)
    const loadA = store.getState().loadSnippets()
    activeProjectPath = "/workspace/project-b"
    queuedResponses.push(jsonResponse([snippet("same-name", "project-b")]))
    await store.getState().loadSnippets()
    expect(store.getState().snippets[0]?.filePath).toContain("project-b")
    activeProjectPath = "/workspace/project-a"
    const joinedA = store.getState().loadSnippets()
    expect(store.getState().snippets).toEqual([])
    expect(store.getState().isLoading).toBe(true)
    first.resolve(new Response("failed", { status: 503 }))
    expect(await loadA).toBe(false)
    expect(await joinedA).toBe(false)
    expect(store.getState().snippets).toEqual([])
    expect(store.getState().isLoading).toBe(false)
  })

  test("one oversized project does not discard other projects' fresh snippet snapshots", async () => {
    const store = await loadStore()
    activeProjectPath = "/workspace/small"
    queuedResponses.push(jsonResponse([snippet("small", "small")]))
    await store.getState().loadSnippets()
    activeProjectPath = "/workspace/large"
    queuedResponses.push(jsonResponse([{ ...snippet("large", "large"), content: "x".repeat(11 * 1024 * 1024) }]))
    await store.getState().loadSnippets()
    activeProjectPath = "/workspace/small"
    await store.getState().loadSnippets()
    expect(fetchCalls).toHaveLength(2)
    expect(store.getState().snippets[0]?.name).toBe("small")
  })

  test("removing the active project's cache releases its loading state and ignores the late read", async () => {
    const store = await loadStore()
    const { clearSnippetsDirectoryCache } = await import("./useSnippetsStore")
    activeProjectPath = "/workspace/removed"
    const delayed = createDeferred<Response>()
    queuedResponses.push(delayed.promise)
    const pending = store.getState().loadSnippets()
    expect(store.getState().isLoading).toBe(true)
    clearSnippetsDirectoryCache(activeProjectPath)
    expect(store.getState().isLoading).toBe(false)
    delayed.resolve(jsonResponse([snippet("late", "removed")]))
    expect(await pending).toBe(false)
    expect(store.getState().snippets).toEqual([])
    expect(store.getState().isLoading).toBe(false)
  })

})
