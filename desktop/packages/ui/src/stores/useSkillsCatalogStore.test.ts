import { beforeEach, describe, expect, test, vi } from "vitest"

import { API_ENDPOINTS } from "@/lib/http"

const directoryState = vi.hoisted(() => ({ current: "/workspace/project" }))

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => directoryState.current,
  },
}))

vi.doMock("@/stores/useSkillsStore", () => ({
  refreshSkillsAfterAxCodeRestart: vi.fn(async () => undefined),
  useSkillsStore: {
    getState: () => ({
      loadSkills: vi.fn(() => undefined),
    }),
  },
}))

vi.doMock("@/lib/configUpdate", () => ({
  startConfigUpdate: vi.fn(() => undefined),
  finishConfigUpdate: vi.fn(() => undefined),
  updateConfigUpdateMessage: vi.fn(() => undefined),
}))

const { FALLBACK_SOURCES, useSkillsCatalogStore } = await import("./useSkillsCatalogStore")

type FetchCall = {
  input: RequestInfo | URL
  init?: RequestInit
}

// A queued entry is either the response or a promise of one, so a test can let an older request
// answer after a newer one.
type QueuedFetchResponse = Response | (() => Promise<Response>)

const fetchCalls: FetchCall[] = []
let queuedResponses: QueuedFetchResponse[] = []

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  fetchCalls.push({ input, init })
  const queued = queuedResponses.shift()
  if (typeof queued === "function") {
    return queued()
  }
  return queued ?? jsonResponse({ ok: true, items: [], nextCursor: null })
})

const queueFetchResponses = (responses: QueuedFetchResponse[]) => {
  queuedResponses = [...responses]
}

const resetStore = () => {
  useSkillsCatalogStore.setState({
    sources: [],
    itemsBySource: {},
    selectedSourceId: null,
    pageInfoBySource: {},
    loadedSourceIds: {},
    clawdhubHasMoreBySource: {},
    isLoadingCatalog: false,
    isLoadingSource: false,
    isLoadingMore: false,
    isScanning: false,
    isInstalling: false,
    lastCatalogError: null,
    lastScanError: null,
    lastInstallError: null,
    scanResults: null,
  })
}

describe("useSkillsCatalogStore", () => {
  beforeEach(() => {
    resetStore()
    directoryState.current = "/workspace/project"
    fetchCalls.length = 0
    queuedResponses = []
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
  })

  test("keeps curated fallback sources broad enough for the catalog", () => {
    expect(FALLBACK_SOURCES.map((source) => source.id)).toEqual([
      "anthropic",
      "mattpocock",
      "jeffallan",
      "jezweb",
      "engineering-workflows",
      "posit",
      "clawdhub",
    ])
  })

  test("keeps ClawdHub pagination available when a filtered page has no visible items", async () => {
    queueFetchResponses([jsonResponse({ ok: true, items: [], nextCursor: "cursor-2" })])

    const loaded = await useSkillsCatalogStore.getState().loadSource("clawdhub")

    expect(loaded).toBe(true)
    expect(useSkillsCatalogStore.getState().itemsBySource.clawdhub).toEqual([])
    expect(useSkillsCatalogStore.getState().pageInfoBySource.clawdhub).toEqual({ nextCursor: "cursor-2" })
    expect(useSkillsCatalogStore.getState().clawdhubHasMoreBySource.clawdhub).toBe(true)
  })

  test("keeps loading more ClawdHub pages when no new item is added but a next cursor remains", async () => {
    useSkillsCatalogStore.setState({
      selectedSourceId: "clawdhub",
      itemsBySource: {
        clawdhub: [
          {
            sourceId: "clawdhub",
            repoSource: "clawdhub:registry",
            skillDir: "review-code",
            skillName: "review-code",
            installable: true,
          },
        ],
      },
      pageInfoBySource: { clawdhub: { nextCursor: "cursor-2" } },
      clawdhubHasMoreBySource: { clawdhub: true },
    })
    queueFetchResponses([
      jsonResponse({
        ok: true,
        items: [
          {
            sourceId: "clawdhub",
            repoSource: "clawdhub:registry",
            skillDir: "review-code",
            skillName: "review-code",
            installable: true,
          },
        ],
        nextCursor: "cursor-3",
      }),
    ])

    const loaded = await useSkillsCatalogStore.getState().loadMoreClawdHub()

    expect(loaded).toBe(true)
    expect(String(fetchCalls[0]?.input)).toContain(API_ENDPOINTS.config.skillsCatalogSource)
    expect(String(fetchCalls[0]?.input)).toContain("cursor=cursor-2")
    expect(useSkillsCatalogStore.getState().itemsBySource.clawdhub).toHaveLength(1)
    expect(useSkillsCatalogStore.getState().pageInfoBySource.clawdhub).toEqual({ nextCursor: "cursor-3" })
    expect(useSkillsCatalogStore.getState().clawdhubHasMoreBySource.clawdhub).toBe(true)
  })

  test("keeps the newest page when an older load for the same source answers last", async () => {
    // The sequence guarded the loading flag and the error, not the page: two overlapping loads for
    // one source let the older answer replace the newer one.
    let releaseOlder: (() => void) | undefined
    queueFetchResponses([
      () =>
        new Promise<Response>((resolve) => {
          releaseOlder = () => resolve(jsonResponse({ ok: true, items: [{ skillName: "old" }], nextCursor: null }))
        }),
      jsonResponse({ ok: true, items: [{ skillName: "new" }], nextCursor: null }),
    ])

    const older = useSkillsCatalogStore.getState().loadSource("source-a")
    const newer = useSkillsCatalogStore.getState().loadSource("source-a")
    await newer

    releaseOlder?.()
    await older

    expect(useSkillsCatalogStore.getState().itemsBySource["source-a"]?.map((item) => item.skillName)).toEqual(["new"])
  })

  test("a forced refresh is not evicted by an older in-flight catalog load", async () => {
    const pending: Array<(response: Response) => void> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
    )

    const first = useSkillsCatalogStore.getState().loadCatalog()
    const forced = useSkillsCatalogStore.getState().loadCatalog({ refresh: true })

    // Settle the older, non-forced load while the forced one is still in flight.
    // An unconditional release would drop the forced load's in-flight entry here.
    pending[0](jsonResponse({ ok: true, sources: [], items: [] }))
    await first

    const third = useSkillsCatalogStore.getState().loadCatalog()

    // The third call must join the still-pending forced load, not start a fetch.
    expect(pending).toHaveLength(2)

    pending[1](jsonResponse({ ok: true, sources: [], items: [] }))
    await Promise.all([forced, third])

    expect(useSkillsCatalogStore.getState().isLoadingCatalog).toBe(false)
  })

  test("a cache hit for the same directory does not discard an in-flight forced refresh", async () => {
    // Prime the cache so the second load takes the cache-hit path.
    queueFetchResponses([jsonResponse({ ok: true, sources: [FALLBACK_SOURCES[0]], items: [] })])
    await useSkillsCatalogStore.getState().loadCatalog()

    let resolveRefresh!: (response: Response) => void
    queueFetchResponses([
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve
        }),
    ])
    // Callers such as the skills page and Settings rerun a plain load while the
    // forced refresh is still in flight. The refresh must keep owning the sequence,
    // or its response is silently dropped and loading reads finished.
    const forced = useSkillsCatalogStore.getState().loadCatalog({ refresh: true })
    const cacheHit = await useSkillsCatalogStore.getState().loadCatalog()

    expect(cacheHit).toBe(true)
    expect(fetchCalls).toHaveLength(2)

    const refreshedSource = { ...FALLBACK_SOURCES[0]!, label: "Refreshed" }
    resolveRefresh(jsonResponse({ ok: true, sources: [refreshedSource], items: [] }))
    await Promise.all([forced, cacheHit])

    const state = useSkillsCatalogStore.getState()
    expect(state.sources).toEqual([refreshedSource])
    expect(state.isLoadingCatalog).toBe(false)
  })

  test("a cache hit still supersedes a same-key load another directory displaced", async () => {
    const cachedSource = FALLBACK_SOURCES[0]!
    const otherSource = { ...cachedSource, id: "other-directory" }
    let resolveStaleSameKey!: (response: Response) => void
    let resolveOtherDirectory!: (response: Response) => void
    queueFetchResponses([
      jsonResponse({ ok: true, sources: [cachedSource], items: [] }),
      () =>
        new Promise<Response>((resolve) => {
          resolveStaleSameKey = resolve
        }),
      () =>
        new Promise<Response>((resolve) => {
          resolveOtherDirectory = resolve
        }),
    ])

    // Prime this directory's cache.
    await useSkillsCatalogStore.getState().loadCatalog()
    const staleSameKey = useSkillsCatalogStore.getState().loadCatalog({ refresh: true })

    // Another directory starts a newer load, displacing that refresh.
    directoryState.current = "/workspace/other"
    const otherDirectory = useSkillsCatalogStore.getState().loadCatalog()

    // Back on the first directory, the cache hit must still invalidate the newer load
    // for the other directory; the old same-key load is not the latest request.
    directoryState.current = "/workspace/project"
    await expect(useSkillsCatalogStore.getState().loadCatalog()).resolves.toBe(true)

    resolveOtherDirectory(jsonResponse({ ok: true, sources: [otherSource], items: [] }))
    await expect(otherDirectory).resolves.toBe(false)
    resolveStaleSameKey(jsonResponse({ ok: true, sources: [otherSource], items: [] }))
    await expect(staleSameKey).resolves.toBe(false)

    const state = useSkillsCatalogStore.getState()
    expect(state.sources).toEqual([cachedSource])
    expect(state.isLoadingCatalog).toBe(false)
  })

  test("a duplicate catalog load joins the in-flight load without discarding it", async () => {
    const pending: Array<(response: Response) => void> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
    )

    const first = useSkillsCatalogStore.getState().loadCatalog()
    const duplicate = useSkillsCatalogStore.getState().loadCatalog()
    await Promise.resolve()

    // The duplicate must not start a second fetch or invalidate the owner.
    expect(pending).toHaveLength(1)

    pending[0](jsonResponse({ ok: true, sources: [FALLBACK_SOURCES[0]], items: [] }))
    await Promise.all([first, duplicate])

    const state = useSkillsCatalogStore.getState()
    expect(state.sources).toEqual([FALLBACK_SOURCES[0]])
    expect(state.isLoadingCatalog).toBe(false)
  })

  test("a forced catalog refresh keeps items for sources that still exist", async () => {
    const kept = FALLBACK_SOURCES[0]!
    const removed = { ...kept, id: "removed-catalog" }
    useSkillsCatalogStore.setState({
      sources: [kept, removed],
      selectedSourceId: kept.id,
      itemsBySource: {
        [kept.id]: [{ sourceId: kept.id, repoSource: kept.source, skillDir: "existing", skillName: "existing", installable: true }],
        [removed.id]: [{ sourceId: removed.id, repoSource: removed.source, skillDir: "stale", skillName: "stale", installable: true }],
      },
      pageInfoBySource: { [kept.id]: { nextCursor: null }, [removed.id]: { nextCursor: "cursor-2" } },
      loadedSourceIds: { [kept.id]: true, [removed.id]: true },
      clawdhubHasMoreBySource: { [removed.id]: true },
    })
    queueFetchResponses([jsonResponse({ ok: true, sources: [kept], items: [] })])

    const refreshed = await useSkillsCatalogStore.getState().loadCatalog({ refresh: true })

    expect(refreshed).toBe(true)
    const state = useSkillsCatalogStore.getState()
    expect(state.itemsBySource[kept.id]?.map((item) => item.skillName)).toEqual(["existing"])
    expect(state.pageInfoBySource[kept.id]).toEqual({ nextCursor: null })
    expect(state.loadedSourceIds[kept.id]).toBe(true)
    expect(state.itemsBySource[removed.id]).toBeUndefined()
    expect(state.pageInfoBySource[removed.id]).toBeUndefined()
    expect(state.loadedSourceIds[removed.id]).toBeUndefined()
    expect(state.clawdhubHasMoreBySource[removed.id]).toBeUndefined()
    expect(state.selectedSourceId).toBe(kept.id)
  })
})
