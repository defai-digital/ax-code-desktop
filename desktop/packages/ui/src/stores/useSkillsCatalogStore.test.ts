import { beforeEach, describe, expect, test, vi } from "vitest"

import { API_ENDPOINTS } from "@/lib/http"

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => "/workspace/project",
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
  })
})
