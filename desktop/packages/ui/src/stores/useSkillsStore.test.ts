import { beforeEach, describe, expect, test, vi } from "vitest"

let currentDirectory = "/workspace/project"

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

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => currentDirectory,
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

let useSkillsStore: (typeof import("./useSkillsStore"))["useSkillsStore"]

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

const fetchCalls: Array<RequestInfo | URL> = []
let queuedResponses: Array<Response | Promise<Response>> = []

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  fetchCalls.push(input)
  return queuedResponses.shift() ?? jsonResponse({ skills: [] })
})

const resetStore = () => {
  useSkillsStore.setState({
    selectedSkillName: null,
    skills: [],
    isLoading: false,
    skillDraft: null,
  })
}

describe("useSkillsStore", () => {
  beforeEach(async () => {
    vi.resetModules()
    ;({ useSkillsStore } = await import("./useSkillsStore"))
    currentDirectory = "/workspace/project"
    resetStore()
    fetchCalls.length = 0
    queuedResponses = []
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  test("keeps the newest skill list after switching directories", async () => {
    const staleSkills = createDeferred<Response>()
    const latestSkills = createDeferred<Response>()
    queuedResponses = [staleSkills.promise, latestSkills.promise]

    currentDirectory = "/workspace/old-project"
    const oldLoad = useSkillsStore.getState().loadSkills()
    currentDirectory = "/workspace/new-project"
    const newLoad = useSkillsStore.getState().loadSkills()
    await Promise.resolve()

    latestSkills.resolve(
      jsonResponse({
        skills: [
          {
            name: "new-skill",
            path: "/workspace/new-project/skills/new-skill/SKILL.md",
            scope: "project",
            source: "ax-code",
            sources: { md: { description: "new" } },
          },
        ],
      }),
    )
    await newLoad

    staleSkills.resolve(
      jsonResponse({
        skills: [
          {
            name: "old-skill",
            path: "/workspace/old-project/skills/old-skill/SKILL.md",
            scope: "project",
            source: "ax-code",
            sources: { md: { description: "old" } },
          },
        ],
      }),
    )
    // The discarded load owns nothing in the store, so it must report that instead
    // of claiming this directory's skills are loaded.
    await expect(oldLoad).resolves.toBe(false)

    expect(fetchCalls.map(String)).toEqual([
      "/api/config/skills?directory=%2Fworkspace%2Fold-project",
      "/api/config/skills?directory=%2Fworkspace%2Fnew-project",
    ])
    expect(useSkillsStore.getState().skills).toEqual([
      {
        name: "new-skill",
        path: "/workspace/new-project/skills/new-skill/SKILL.md",
        scope: "project",
        source: "ax-code",
        description: "new",
        group: undefined,
      },
    ])
    expect(useSkillsStore.getState().isLoading).toBe(false)
  })

  test("a delete completion cannot clear the new project's same-name selection", async () => {
    const deletion = createDeferred<Response>()
    useSkillsStore.setState({
      selectedSkillName: "review",
      skills: [{ name: "review", path: "/workspace/project/skills/review/SKILL.md", scope: "project", source: "ax-code" }],
    })
    queuedResponses = [
      deletion.promise,
      jsonResponse({
        skills: [{ name: "review", path: "/workspace/other/skills/review/SKILL.md", scope: "project", source: "ax-code" }],
      }),
    ]

    const pending = useSkillsStore
      .getState()
      .deleteSkill("review", { scope: "project", source: "ax-code", directory: "/workspace/project" })

    currentDirectory = "/workspace/other"
    useSkillsStore.setState({ selectedSkillName: "review" })
    deletion.resolve(jsonResponse({ requiresReload: false, reloadFailed: true }))

    await pending

    expect(useSkillsStore.getState().selectedSkillName).toBe("review")
    expect(useSkillsStore.getState().skills[0]?.name).toBe("review")
  })

  test("a stale delete request cannot target the new project", async () => {
    currentDirectory = "/workspace/other"

    const result = await useSkillsStore
      .getState()
      .deleteSkill("review", { scope: "project", source: "ax-code", directory: "/workspace/project" })

    expect(result).toBe(false)
    expect(fetchCalls).toHaveLength(0)
  })

  test("a user-scope mutation invalidates every project's cached catalog", async () => {
    currentDirectory = "/workspace/one"
    queuedResponses = [jsonResponse({ skills: [] })]
    await useSkillsStore.getState().loadSkills()

    currentDirectory = "/workspace/two"
    queuedResponses = [
      jsonResponse({
        skills: [{ name: "shared", path: "/workspace/two/skills/shared/SKILL.md", scope: "user", source: "ax-code" }],
      }),
    ]
    await useSkillsStore.getState().loadSkills()

    queuedResponses = [jsonResponse({ requiresReload: false, reloadFailed: true }), jsonResponse({ skills: [] })]
    useSkillsStore.setState({ selectedSkillName: "shared" })
    await useSkillsStore.getState().deleteSkill("shared", { scope: "user", directory: "/workspace/two" })

    currentDirectory = "/workspace/one"
    queuedResponses = [jsonResponse({ skills: [] })]
    await useSkillsStore.getState().loadSkills()

    // Without clearing every directory's cache this last load reused the
    // pre-delete catalog from /workspace/one.
    expect(fetchCalls.map(String)).toEqual([
      "/api/config/skills?directory=%2Fworkspace%2Fone",
      "/api/config/skills?directory=%2Fworkspace%2Ftwo",
      "/api/config/skills/shared?directory=%2Fworkspace%2Ftwo&scope=user",
      "/api/config/skills?directory=%2Fworkspace%2Ftwo",
      "/api/config/skills?directory=%2Fworkspace%2Fone",
    ])
  })

  test("reads a supporting file with a directory query, not an appended path fragment", async () => {
    // Regression: `&directory=` on a URL with no query string made the server read
    // the file name as "…notes.md&directory=…", so every supporting file came back
    // empty and a rename/duplicate could then drop it for good.
    queuedResponses = [jsonResponse({ content: "notes" })]

    await useSkillsStore.getState().readSupportingFile("demo-skill", "notes.md")

    expect(fetchCalls.map(String)).toEqual(["/api/config/skills/demo-skill/files/notes.md?directory=%2Fworkspace%2Fproject"])
  })
})
