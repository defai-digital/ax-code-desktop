import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Agent } from "@defai-digital/ax-code-sdk/v2"

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

const agentLists: Array<Deferred<unknown[]>> = []
const withDirectories: Array<string | null> = []

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
    withDirectory: async (directory: string | null, run: () => Promise<unknown>) => {
      withDirectories.push(directory)
      return await run()
    },
    listAgents: vi.fn(async () => {
      return await (agentLists.shift()?.promise ?? Promise.resolve([]))
    }),
  },
}))

vi.doMock("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({
      loadConfig: vi.fn(async () => undefined),
      invalidateModelMetadataCache: vi.fn(() => undefined),
    }),
    setState: vi.fn(() => undefined),
  },
}))

vi.doMock("@/stores/useCommandsStore", () => ({
  useCommandsStore: {
    getState: () => ({
      loadCommands: vi.fn(async () => true),
    }),
  },
}))

vi.doMock("@/stores/useSkillsStore", () => ({
  useSkillsStore: {
    getState: () => ({
      loadSkills: vi.fn(async () => true),
    }),
  },
}))

vi.doMock("@/stores/useSkillsCatalogStore", () => ({
  useSkillsCatalogStore: {
    getState: () => ({
      loadCatalog: vi.fn(async () => true),
    }),
  },
}))

vi.doMock("@/lib/configSync", () => ({
  emitConfigChange: vi.fn(() => undefined),
  scopeMatches: vi.fn(() => false),
  subscribeToConfigChanges: vi.fn(() => () => undefined),
}))

vi.doMock("@/lib/configUpdate", () => ({
  startConfigUpdate: vi.fn(() => undefined),
  finishConfigUpdate: vi.fn(() => undefined),
  updateConfigUpdateMessage: vi.fn(() => undefined),
  subscribeConfigUpdate: vi.fn(() => () => undefined),
  getConfigUpdateSnapshot: vi.fn(() => ({ isUpdating: false, message: null })),
}))

const { useAgentsStore } = await import("./useAgentsStore")

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

const fetchCalls: Array<RequestInfo | URL> = []
const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  fetchCalls.push(input)
  const name = String(input).includes("new-agent") ? "new-agent" : "old-agent"
  const project = String(input).includes("new-project") ? "new-project" : "old-project"
  return jsonResponse({
    scope: "project",
    sources: {
      md: {
        path: `/workspace/${project}/agents/${name}.md`,
      },
    },
  })
})

const resetStore = () => {
  useAgentsStore.setState({
    selectedAgentName: null,
    agents: [],
    isLoading: false,
    agentDraft: null,
  })
}

describe("useAgentsStore", () => {
  beforeEach(() => {
    activeProjectPath = "/workspace/project"
    resetStore()
    agentLists.length = 0
    withDirectories.length = 0
    fetchCalls.length = 0
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  test("keeps the newest agent list after switching project directories", async () => {
    const staleAgents = createDeferred<unknown[]>()
    const latestAgents = createDeferred<unknown[]>()
    agentLists.push(staleAgents, latestAgents)

    activeProjectPath = "/workspace/old-project"
    const oldLoad = useAgentsStore.getState().loadAgents()
    activeProjectPath = "/workspace/new-project"
    const newLoad = useAgentsStore.getState().loadAgents()
    await Promise.resolve()

    latestAgents.resolve([{ name: "new-agent" }])
    await expect(newLoad).resolves.toBe(true)

    staleAgents.resolve([{ name: "old-agent" }])
    // The discarded load owns nothing in the store, so it reports that instead of
    // letting the config store read this directory's agents from the other list.
    await expect(oldLoad).resolves.toBe(false)

    expect(withDirectories).toEqual(["/workspace/old-project", "/workspace/new-project"])
    expect(fetchCalls.map(String)).toEqual([
      "/api/config/agents/new-agent?directory=%2Fworkspace%2Fnew-project",
      "/api/config/agents/old-agent?directory=%2Fworkspace%2Fold-project",
    ])
    expect(useAgentsStore.getState().agents).toEqual([
      {
        name: "new-agent",
        scope: "project",
        group: undefined,
      },
    ])
    expect(useAgentsStore.getState().isLoading).toBe(false)
  })

  test("a reload whose only change is a permission or disable edit still reaches the store", async () => {
    // Regression: the reload gate's signature only listed mode/model/prompt, so a
    // PATCH that changed just the permission ruleset (or the disable flag) was
    // dropped and the editor kept showing — and re-saving — the stale rules.
    const denied = createDeferred<unknown[]>()
    agentLists.push(denied)

    // Directories no other test in this file uses: the load cache is module-level
    // and keyed by directory, so a reused path would short-circuit the reload.
    const firstLoad = useAgentsStore.getState().loadAgents({ directory: "/workspace/permission-before" })
    await Promise.resolve()
    denied.resolve([{ name: "guarded-agent", permission: { bash: "deny" }, disable: false }])
    await firstLoad

    expect(useAgentsStore.getState().agents).toMatchObject([{ permission: { bash: "deny" } }])

    const allowed = createDeferred<unknown[]>()
    agentLists.push(allowed)

    const secondLoad = useAgentsStore.getState().loadAgents({ directory: "/workspace/permission-after" })
    await Promise.resolve()
    allowed.resolve([{ name: "guarded-agent", permission: { bash: "allow" }, disable: false }])
    await secondLoad

    expect(withDirectories).toEqual(["/workspace/permission-before", "/workspace/permission-after"])
    expect(useAgentsStore.getState().agents).toMatchObject([{ permission: { bash: "allow" } }])
  })

  test("a load that was joined by a second caller still commits its result", async () => {
    // Regression: allocating the request id before the single-flight run let the
    // joiner bump the sequence, so the owning load dropped its own result and left
    // isLoading true forever.
    const deferred = createDeferred<unknown[]>()
    agentLists.push(deferred)

    const first = useAgentsStore.getState().loadAgents()
    const second = useAgentsStore.getState().loadAgents()
    deferred.resolve([{ name: "solo-agent" }])
    await Promise.all([first, second])

    expect(useAgentsStore.getState().agents).toEqual([
      {
        name: "solo-agent",
        scope: "project",
        group: undefined,
      },
    ])
    expect(useAgentsStore.getState().isLoading).toBe(false)
  })

  test("a delete completion cannot clear the new project's same-name selection", async () => {
    const deletion = createDeferred<Response>()
    useAgentsStore.setState({
      selectedAgentName: "review",
      agents: [{ name: "review" } as Agent],
    })
    fetchMock.mockImplementationOnce(async () => deletion.promise)

    const pending = useAgentsStore
      .getState()
      .deleteAgent("review", { scope: "project", directory: "/workspace/project" })

    activeProjectPath = "/workspace/other"
    useAgentsStore.setState({ selectedAgentName: "review" })
    const otherAgents = createDeferred<unknown[]>()
    otherAgents.resolve([{ name: "review" }])
    agentLists.push(otherAgents)
    deletion.resolve(jsonResponse({ requiresReload: false, reloadFailed: true }))

    await pending

    expect(useAgentsStore.getState().selectedAgentName).toBe("review")
    expect(useAgentsStore.getState().agents[0]?.name).toBe("review")
  })

  test("a stale delete request cannot target the new project", async () => {
    activeProjectPath = "/workspace/other"

    const result = await useAgentsStore
      .getState()
      .deleteAgent("review", { scope: "project", directory: "/workspace/project" })

    expect(result).toBe(false)
    expect(fetchCalls).toHaveLength(0)
  })

  test("a mutation invalidates the TTL cache before reloading", async () => {
    const initial = createDeferred<unknown[]>()
    initial.resolve([])
    agentLists.push(initial)
    await useAgentsStore.getState().loadAgents()

    fetchMock.mockImplementationOnce(async () => jsonResponse({ requiresReload: false }))
    const reloaded = createDeferred<unknown[]>()
    agentLists.push(reloaded)
    const pending = useAgentsStore.getState().createAgent({ name: "cached-agent", scope: "project" })
    await Promise.resolve()
    reloaded.resolve([{ name: "cached-agent" }])
    await pending

    // Without invalidating the per-directory timestamp, this load hit the 5s
    // cache and never asked the runtime for the new list.
    expect(withDirectories).toHaveLength(2)
  })

  test("releases the in-flight slot when a load never settles", async () => {
    // A wedged request used to hold the single-flight slot, so every later load
    // for that directory joined a promise that never resolved and the agent list
    // could not refresh for the rest of the session.
    vi.useFakeTimers()
    try {
      const hung = createDeferred<unknown[]>()
      agentLists.push(hung)
      activeProjectPath = "/workspace/wedged"

      const wedged = useAgentsStore.getState().loadAgents()
      await vi.advanceTimersByTimeAsync(60_000)
      await expect(wedged).resolves.toBe(false)
      expect(useAgentsStore.getState().isLoading).toBe(false)

      const retry = createDeferred<unknown[]>()
      agentLists.push(retry)
      const second = useAgentsStore.getState().loadAgents()
      await Promise.resolve()
      expect(withDirectories.filter((directory) => directory === "/workspace/wedged")).toHaveLength(2)

      retry.resolve([{ name: "new-agent" }])
      await expect(second).resolves.toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
