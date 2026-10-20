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

const commandLists: Array<Deferred<unknown[]>> = []
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
    listCommandsWithDetails: vi.fn(async () => {
      return await (commandLists.shift()?.promise ?? Promise.resolve([]))
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

let useCommandsStore: (typeof import("./useCommandsStore"))["useCommandsStore"]

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

const fetchCalls: Array<RequestInfo | URL> = []
const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  fetchCalls.push(input)
  return jsonResponse({ scope: "project" })
})

const resetStore = () => {
  useCommandsStore.setState({
    selectedCommandName: null,
    commands: [],
    isLoading: false,
    commandDraft: null,
  })
}

describe("useCommandsStore", () => {
  beforeEach(async () => {
    vi.resetModules()
    ;({ useCommandsStore } = await import("./useCommandsStore"))
    activeProjectPath = "/workspace/project"
    resetStore()
    commandLists.length = 0
    withDirectories.length = 0
    fetchCalls.length = 0
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  test("preserves runtime skill commands for slash dispatch without reading editable configuration", async () => {
    const list = createDeferred<unknown[]>()
    commandLists.push(list)
    const loading = useCommandsStore.getState().loadCommands()
    list.resolve([{ name: "analysis-output", source: "skill", description: "Analyze data", template: "Analyze" }])
    expect(await loading).toBe(true)
    expect(useCommandsStore.getState().getCommandByName("analysis-output")?.source).toBe("skill")
    expect(fetchCalls).toEqual([])
    useCommandsStore.setState({ commands: [] })
    expect(await useCommandsStore.getState().loadCommands()).toBe(true)
    expect(useCommandsStore.getState().commands[0]?.name).toBe("analysis-output")
  })

  test("a delete completion cannot clear the new project's same-name selection", async () => {
    const deletion = createDeferred<Response>()
    useCommandsStore.setState({
      selectedCommandName: "review",
      commands: [{ name: "review", scope: "project" }],
    })
    fetchMock.mockImplementationOnce(async () => deletion.promise)

    const pending = useCommandsStore
      .getState()
      .deleteCommand("review", { scope: "project", directory: "/workspace/project" })

    activeProjectPath = "/workspace/other"
    useCommandsStore.setState({ selectedCommandName: "review" })
    const otherCommands = createDeferred<unknown[]>()
    otherCommands.resolve([{ name: "review", source: "project" }])
    commandLists.push(otherCommands)
    deletion.resolve(jsonResponse({ requiresReload: false, reloadFailed: true }))

    await pending

    expect(useCommandsStore.getState().selectedCommandName).toBe("review")
    expect(useCommandsStore.getState().commands[0]?.name).toBe("review")
  })

  test("a stale delete request cannot target the new project", async () => {
    activeProjectPath = "/workspace/other"

    const result = await useCommandsStore
      .getState()
      .deleteCommand("review", { scope: "project", directory: "/workspace/project" })

    expect(result).toBe(false)
    expect(fetchCalls).toHaveLength(0)
  })

  test("a user-scope mutation invalidates every project's cached catalog", async () => {
    activeProjectPath = "/workspace/one"
    const first = createDeferred<unknown[]>()
    first.resolve([])
    commandLists.push(first)
    await useCommandsStore.getState().loadCommands()

    activeProjectPath = "/workspace/two"
    const second = createDeferred<unknown[]>()
    second.resolve([{ name: "shared", source: "user" }])
    commandLists.push(second)
    await useCommandsStore.getState().loadCommands()

    fetchMock.mockImplementationOnce(async () => jsonResponse({ requiresReload: false, reloadFailed: true }))
    const afterDelete = createDeferred<unknown[]>()
    afterDelete.resolve([])
    commandLists.push(afterDelete)
    useCommandsStore.setState({ selectedCommandName: "shared" })
    await useCommandsStore.getState().deleteCommand("shared", { scope: "user", directory: "/workspace/two" })

    activeProjectPath = "/workspace/one"
    const third = createDeferred<unknown[]>()
    third.resolve([])
    commandLists.push(third)
    const reload = useCommandsStore.getState().loadCommands()
    await Promise.resolve()
    third.resolve([])
    await reload

    // Without clearing every directory's cache this last load reused the
    // pre-delete catalog from /workspace/one.
    expect(withDirectories).toEqual([
      "/workspace/one",
      "/workspace/two",
      "/workspace/two",
      "/workspace/one",
    ])
  })

  test("keeps the newest command list after switching project directories", async () => {
    const staleCommands = createDeferred<unknown[]>()
    const latestCommands = createDeferred<unknown[]>()
    commandLists.push(staleCommands, latestCommands)

    activeProjectPath = "/workspace/old-project"
    const oldLoad = useCommandsStore.getState().loadCommands()
    activeProjectPath = "/workspace/new-project"
    const newLoad = useCommandsStore.getState().loadCommands()
    await Promise.resolve()

    latestCommands.resolve([{ name: "new-command", source: "project" }])
    await newLoad

    staleCommands.resolve([{ name: "old-command", source: "project" }])
    // The discarded load owns nothing in the store, so it must report that instead
    // of claiming this directory's commands are loaded: the slash-command path
    // reads `true` as "the catalog holds this directory" and would otherwise send
    // an unknown command as plain text.
    await expect(oldLoad).resolves.toBe(false)

    expect(withDirectories).toEqual(["/workspace/old-project", "/workspace/new-project"])
    expect(fetchCalls.map(String)).toEqual([
      "/api/config/commands/new-command?directory=%2Fworkspace%2Fnew-project",
      "/api/config/commands/old-command?directory=%2Fworkspace%2Fold-project",
    ])
    expect(useCommandsStore.getState().commands).toEqual([
      {
        name: "new-command",
        source: "project",
        scope: "project",
      },
    ])
    expect(useCommandsStore.getState().isLoading).toBe(false)
  })
})
