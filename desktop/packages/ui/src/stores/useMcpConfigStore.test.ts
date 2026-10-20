import { beforeEach, describe, expect, test, vi } from "vitest"

import type { McpServerWithScope } from "./useMcpConfigStore"

let activeProjectPath = "/workspace/project"

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

vi.doMock("@/stores/useAgentsStore", () => ({
  refreshAfterAxCodeRestart: vi.fn(async () => undefined),
}))

vi.doMock("@/lib/configUpdate", () => ({
  startConfigUpdate: vi.fn(() => undefined),
  finishConfigUpdate: vi.fn(() => undefined),
  subscribeConfigUpdate: vi.fn(() => () => undefined),
  getConfigUpdateSnapshot: vi.fn(() => ({ isUpdating: false, message: null })),
}))

let useMcpConfigStore: (typeof import("./useMcpConfigStore"))["useMcpConfigStore"]

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

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })

type FetchCall = {
  input: RequestInfo | URL
  init?: RequestInit
}

const fetchCalls: FetchCall[] = []
let queuedResponses: Array<Response | Promise<Response>> = []

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  fetchCalls.push({ input, init })
  return queuedResponses.shift() ?? jsonResponse([])
})

const queueFetchResponses = (responses: Array<Response | Promise<Response>>) => {
  queuedResponses = [...responses]
}

const resetStore = () => {
  useMcpConfigStore.setState({
    mcpServers: [],
    selectedMcpName: null,
    isLoading: false,
    mcpDraft: null,
  })
}

describe("useMcpConfigStore", () => {
  beforeEach(async () => {
    vi.resetModules()
    ;({ useMcpConfigStore } = await import("./useMcpConfigStore"))
    activeProjectPath = "/workspace/project"
    resetStore()
    fetchCalls.length = 0
    queuedResponses = []
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  test("keeps the newest forced MCP config list when refreshes overlap", async () => {
    const staleRefresh = createDeferred<Response>()
    const latestRefresh = createDeferred<Response>()
    const staleServer: McpServerWithScope = {
      name: "stale",
      type: "local",
      command: ["node", "stale.js"],
      enabled: true,
      scope: "project",
    }
    const latestServer: McpServerWithScope = {
      name: "latest",
      type: "local",
      command: ["node", "latest.js"],
      enabled: true,
      scope: "project",
    }
    queueFetchResponses([staleRefresh.promise, latestRefresh.promise])

    const firstLoad = useMcpConfigStore.getState().loadMcpConfigs({ force: true })
    const secondLoad = useMcpConfigStore.getState().loadMcpConfigs({ force: true })
    await Promise.resolve()

    latestRefresh.resolve(jsonResponse([latestServer]))
    await secondLoad

    staleRefresh.resolve(jsonResponse([staleServer]))
    await firstLoad

    expect(fetchCalls).toHaveLength(2)
    expect(fetchCalls[0]?.input).toBe("/api/config/mcp?directory=%2Fworkspace%2Fproject")
    expect(useMcpConfigStore.getState().mcpServers).toEqual([latestServer])
    expect(useMcpConfigStore.getState().loadedDirectory).toBe("/workspace/project")
    expect(useMcpConfigStore.getState().isLoading).toBe(false)
  })

  test("keeps the newest MCP config list after switching project directories", async () => {
    const staleRefresh = createDeferred<Response>()
    const latestRefresh = createDeferred<Response>()
    const staleServer: McpServerWithScope = {
      name: "old-project",
      type: "local",
      command: ["node", "old-project.js"],
      enabled: true,
      scope: "project",
    }
    const latestServer: McpServerWithScope = {
      name: "new-project",
      type: "local",
      command: ["node", "new-project.js"],
      enabled: true,
      scope: "project",
    }
    queueFetchResponses([staleRefresh.promise, latestRefresh.promise])

    activeProjectPath = "/workspace/old-project"
    const oldLoad = useMcpConfigStore.getState().loadMcpConfigs({ force: true })
    activeProjectPath = "/workspace/new-project"
    const newLoad = useMcpConfigStore.getState().loadMcpConfigs({ force: true })
    await Promise.resolve()

    latestRefresh.resolve(jsonResponse([latestServer]))
    await newLoad

    staleRefresh.resolve(jsonResponse([staleServer]))
    await oldLoad

    expect(fetchCalls.map((call) => call.input)).toEqual([
      "/api/config/mcp?directory=%2Fworkspace%2Fold-project",
      "/api/config/mcp?directory=%2Fworkspace%2Fnew-project",
    ])
    expect(useMcpConfigStore.getState().mcpServers).toEqual([latestServer])
    expect(useMcpConfigStore.getState().loadedDirectory).toBe("/workspace/new-project")
    expect(useMcpConfigStore.getState().isLoading).toBe(false)
  })

  test("cache hits restore inventory provenance and pending loads retain the previous provenance", async () => {
    queueFetchResponses([jsonResponse([])])
    await useMcpConfigStore.getState().loadMcpConfigs()
    expect(useMcpConfigStore.getState().loadedDirectory).toBe("/workspace/project")
    const pending = createDeferred<Response>()
    queueFetchResponses([pending.promise])
    activeProjectPath = "/workspace/other"
    const load = useMcpConfigStore.getState().loadMcpConfigs()
    expect(useMcpConfigStore.getState().loadedDirectory).toBe("/workspace/project")
    pending.resolve(jsonResponse([]))
    await load
    expect(useMcpConfigStore.getState().loadedDirectory).toBe("/workspace/other")
    activeProjectPath = "/workspace/project"
    await useMcpConfigStore.getState().loadMcpConfigs()
    expect(useMcpConfigStore.getState().loadedDirectory).toBe("/workspace/project")
    expect(fetchCalls).toHaveLength(2)
  })

  test("an origin delete cannot clear a same-name selection in a different project", async () => {
    const deletion = createDeferred<Response>()
    useMcpConfigStore.setState({ selectedMcpName: "review" })
    queueFetchResponses([deletion.promise])
    const result = useMcpConfigStore.getState().deleteMcp("review")
    activeProjectPath = "/workspace/other"
    const other: McpServerWithScope = { name: "review", type: "remote", url: "https://other.invalid", enabled: false, scope: "project" }
    useMcpConfigStore.setState({ mcpServers: [other], loadedDirectory: activeProjectPath })
    queueFetchResponses([jsonResponse([other])])
    deletion.resolve(jsonResponse({ ok: true }))
    expect(await result).toEqual(expect.objectContaining({ ok: true }))
    expect(fetchCalls[0]?.input).toBe("/api/config/mcp/review?directory=%2Fworkspace%2Fproject")
    expect(useMcpConfigStore.getState().selectedMcpName).toBe("review")
  })

  test("delete acknowledgement preserves a replacement with the same name in the refreshed inventory", async () => {
    const replacement: McpServerWithScope = { name: "review", type: "remote", url: "https://replacement.invalid", enabled: false }
    useMcpConfigStore.setState({ selectedMcpName: "review" })
    queueFetchResponses([jsonResponse({ ok: true }), jsonResponse([replacement])])
    await useMcpConfigStore.getState().deleteMcp("review")
    expect(useMcpConfigStore.getState().selectedMcpName).toBe("review")
    expect(useMcpConfigStore.getState().mcpServers).toEqual([replacement])
  })

  test("current-context deletion clears a missing record after refresh", async () => {
    useMcpConfigStore.setState({ selectedMcpName: "review" })
    queueFetchResponses([jsonResponse({ ok: true }), jsonResponse([])])
    await useMcpConfigStore.getState().deleteMcp("review")
    expect(useMcpConfigStore.getState().selectedMcpName).toBeNull()
  })

  test("delete acknowledgement cannot clear a new same-name draft", async () => {
    useMcpConfigStore.setState({ selectedMcpName: "review", mcpDraft: {
      name: "review", scope: "project", type: "remote", url: "https://new.invalid", command: [], environment: [], headers: [],
      oauthEnabled: false, oauthClientId: "", oauthClientSecret: "", oauthScope: "", oauthRedirectUri: "", timeout: "", enabled: false,
    } })
    queueFetchResponses([jsonResponse({ ok: true }), jsonResponse([])])
    await useMcpConfigStore.getState().deleteMcp("review")
    expect(useMcpConfigStore.getState().selectedMcpName).toBe("review")
  })

  test("a stale caller cannot retarget deletion to the new active directory", async () => {
    activeProjectPath = "/workspace/other"
    const result = await useMcpConfigStore.getState().deleteMcp("review", "/workspace/project")
    expect(result).toEqual(expect.objectContaining({ ok: false, contextChanged: true }))
    expect(fetchCalls).toHaveLength(0)
  })

  test("failed post-delete refresh keeps the existing same-context selection cleanup", async () => {
    const original: McpServerWithScope = { name: "review", type: "remote", url: "https://original.invalid", enabled: false }
    useMcpConfigStore.setState({ selectedMcpName: "review", mcpServers: [original], loadedDirectory: activeProjectPath })
    queueFetchResponses([jsonResponse({ ok: true }), jsonResponse({ error: "Fixture unavailable" }, { status: 503 })])
    expect(await useMcpConfigStore.getState().deleteMcp("review")).toEqual(expect.objectContaining({ ok: true }))
    expect(useMcpConfigStore.getState().selectedMcpName).toBeNull()
  })

  test("failed refresh cannot erase an observed replacement selection", async () => {
    const deletion = createDeferred<Response>()
    const original: McpServerWithScope = { name: "review", type: "remote", url: "https://original.invalid", enabled: false }
    const replacement = { ...original, url: "https://replacement.invalid" }
    useMcpConfigStore.setState({ selectedMcpName: "review", mcpServers: [original], loadedDirectory: activeProjectPath })
    queueFetchResponses([deletion.promise])
    const pending = useMcpConfigStore.getState().deleteMcp("review")
    useMcpConfigStore.setState({ mcpServers: [replacement] })
    queueFetchResponses([jsonResponse({ error: "Fixture unavailable" }, { status: 503 })])
    deletion.resolve(jsonResponse({ ok: true }))
    await pending
    expect(useMcpConfigStore.getState().selectedMcpName).toBe("review")
    expect(useMcpConfigStore.getState().mcpServers).toEqual([replacement])
  })

  test("selected form refresh is scoped and cannot retarget another directory", () => {
    const replacement: McpServerWithScope = { name: "review", type: "remote", url: "https://replacement.invalid", enabled: false }
    useMcpConfigStore.setState({ selectedMcpName: "review", mcpServers: [replacement], loadedDirectory: activeProjectPath })
    expect(useMcpConfigStore.getState().refreshSelectedMcp("review", "/workspace/other")).toBe(false)
    expect(useMcpConfigStore.getState().selectionRevision).toBe(0)
    expect(useMcpConfigStore.getState().refreshSelectedMcp("review", activeProjectPath)).toBe(true)
    expect(useMcpConfigStore.getState().selectionRevision).toBe(1)
  })

  test("an outdated form projection cannot delete a newly revealed same-name server", async () => {
    useMcpConfigStore.setState({ selectionRevision: 1 })
    const result = await useMcpConfigStore.getState().deleteMcp("review", activeProjectPath, 0)
    expect(result).toEqual(expect.objectContaining({ ok: false, contextChanged: true }))
    expect(fetchCalls).toHaveLength(0)
  })

  test("accepted inventory advances form context when a project override reveals user scope", async () => {
    const original: McpServerWithScope = { name: "review", type: "remote", url: "https://project.invalid", scope: "project", enabled: false }
    const fallback = { ...original, scope: "user" as const, url: "https://global.invalid" }
    useMcpConfigStore.setState({ selectedMcpName: "review", mcpServers: [original], loadedDirectory: activeProjectPath })
    queueFetchResponses([jsonResponse([fallback])])
    await useMcpConfigStore.getState().loadMcpConfigs({ force: true })
    expect(useMcpConfigStore.getState().selectionRevision).toBe(1)
    expect(useMcpConfigStore.getState().refreshSelectedMcp("review", activeProjectPath, 0)).toBe(false)
    expect(useMcpConfigStore.getState().selectionRevision).toBe(1)
  })

  test("an accepted scope transition preserves explicit new-draft intent", async () => {
    const original: McpServerWithScope = { name: "review", type: "remote", url: "https://project.invalid", scope: "project", enabled: false }
    useMcpConfigStore.setState({ selectedMcpName: "review", mcpServers: [original], loadedDirectory: activeProjectPath,
      mcpDraft: { name: "review", scope: "project", type: "remote", url: "https://draft.invalid", command: [], environment: [], headers: [],
        oauthEnabled: false, oauthClientId: "", oauthClientSecret: "", oauthScope: "", oauthRedirectUri: "", timeout: "", enabled: false } })
    queueFetchResponses([jsonResponse([{ ...original, scope: "user", url: "https://global.invalid" }])])
    await useMcpConfigStore.getState().loadMcpConfigs({ force: true })
    expect(useMcpConfigStore.getState().selectionRevision).toBe(0)
    expect(useMcpConfigStore.getState().mcpDraft?.url).toBe("https://draft.invalid")
  })
})
