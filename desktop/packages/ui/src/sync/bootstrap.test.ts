import { describe, expect, test, vi } from "vitest"
import type { AxCodeClient, PermissionRequest, QuestionRequest } from "@defai-digital/ax-code-sdk/v2/client"
import type { Event } from "@defai-digital/ax-code-sdk/v2/client"

const { wasPromptRecentlyAcceptedMock } = vi.hoisted(() => ({
  wasPromptRecentlyAcceptedMock: vi.fn<(sessionId: string) => boolean>(() => false),
}))

vi.mock("./session-actions", () => ({
  wasPromptRecentlyAccepted: wasPromptRecentlyAcceptedMock,
}))

import { bootstrapDirectory } from "./bootstrap"
import { applyDirectoryEvent } from "./event-reducer"
import { PartMap } from "./part-map"
import { INITIAL_STATE, type State } from "./types"

function makeHarness(overrides: Partial<State> = {}) {
  let state: State = { ...INITIAL_STATE, ...overrides }
  const getState = () => state
  const set = (patch: Partial<State>) => {
    state = { ...state, ...patch }
  }
  return { getState, set }
}

const flush = async () => {
  // Phase 2 of bootstrapDirectory is intentionally fire-and-forget
  // (`void Promise.allSettled(...)`), so give its microtasks a couple of
  // real turns of the event loop to settle before asserting on state.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function makeBaseSdk(overrides: Record<string, unknown> = {}): AxCodeClient {
  return {
    path: {
      get: vi.fn(async () => ({ data: { state: "", config: "", worktree: "/repo", directory: "/repo", home: "" } })),
    },
    session: { status: vi.fn(async () => ({ data: {} })) },
    lsp: { status: vi.fn(async () => ({ data: [] })) },
    vcs: { get: vi.fn(async () => ({ data: undefined })) },
    question: { list: vi.fn(async () => ({ data: [] as QuestionRequest[] })) },
    permission: { list: vi.fn(async () => ({ data: [] as PermissionRequest[] })) },
    ...overrides,
  } as unknown as AxCodeClient
}

describe("bootstrapDirectory — a session the store has no entry for", () => {
  test("still applies the answer, even though that session's stamp is already non-zero", async () => {
    // The stamp lives in module state and outlives the store, so a session with no entry can already carry
    // one (a reply for a session this window never held stamps it). Comparing it against 0 reads every
    // such session as "changed during the request" and silently drops a pending question the agent is
    // waiting on; the floor stands in for what the session's stamp was when the request went out.
    // A store this window has never held: the stamp survives it, because it lives in module state.
    applyDirectoryEvent({ ...INITIAL_STATE, message: {}, part: PartMap.EMPTY } as State, {
      type: "question.replied",
      properties: { sessionID: "ses_a", requestID: "que_unknown" },
    } as Event)

    const pending = {
      id: "que_1",
      sessionID: "ses_a",
      questions: [{ question: "Continue?", header: "Q", options: [{ label: "Yes", description: "" }] }],
    } as QuestionRequest
    const harness = makeHarness({ question: {} })
    const sdk = makeBaseSdk({ question: { list: vi.fn(async () => ({ data: [pending] })) } })

    await bootstrapDirectory({
      directory: "/repo",
      sdk,
      getState: harness.getState,
      set: harness.set,
      global: { projects: [{ id: "proj_1", worktree: "/repo" } as never] },
      loadSessions: () => undefined,
    })
    await flush()

    expect(harness.getState().question.ses_a?.map((entry) => entry.id)).toEqual(["que_1"])
  })
})

describe("bootstrapDirectory — deferred permission/question resync", () => {
  test("a permission list snapshot fetched concurrently with a live update does not clobber the live update", async () => {
    const perm1 = { id: "perm_1", sessionID: "ses_a", permission: "bash" } as PermissionRequest
    const perm2 = { id: "perm_2", sessionID: "ses_a", permission: "write" } as PermissionRequest

    const { getState, set } = makeHarness({ permission: { ses_a: [perm1] } })

    // Simulate the server computing the snapshot response BEFORE perm_2 was
    // created, while the client's live event handler adds perm_2 to the store
    // while the HTTP request for the snapshot is still in flight — a realistic
    // race during a reconnect resync.
    const permissionList = vi.fn(async () => {
      set({ permission: { ...getState().permission, ses_a: [perm1, perm2] } })
      return { data: [perm1] }
    })

    const sdk = makeBaseSdk({ permission: { list: permissionList } })

    await bootstrapDirectory({
      directory: "/repo",
      sdk,
      getState,
      set,
      global: { projects: [{ id: "proj_1", worktree: "/repo" } as never] },
      loadSessions: () => undefined,
    })
    await flush()

    expect(permissionList).toHaveBeenCalledTimes(1)
    // The concurrently-arrived perm_2 must survive: the stale snapshot (which
    // only knew about perm_1) must not overwrite the live state.
    expect(
      getState()
        .permission.ses_a?.map((p) => p.id)
        .sort(),
    ).toEqual(["perm_1", "perm_2"])
  })

  test("a question list snapshot fetched concurrently with a live update does not clobber the live update", async () => {
    const que1 = { id: "que_1", sessionID: "ses_a", questions: [] } as unknown as QuestionRequest
    const que2 = { id: "que_2", sessionID: "ses_a", questions: [] } as unknown as QuestionRequest

    const { getState, set } = makeHarness({ question: { ses_a: [que1] } })

    const questionList = vi.fn(async () => {
      set({ question: { ...getState().question, ses_a: [que1, que2] } })
      return { data: [que1] }
    })

    const sdk = makeBaseSdk({ question: { list: questionList } })

    await bootstrapDirectory({
      directory: "/repo",
      sdk,
      getState,
      set,
      global: { projects: [{ id: "proj_1", worktree: "/repo" } as never] },
      loadSessions: () => undefined,
    })
    await flush()

    expect(questionList).toHaveBeenCalledTimes(1)
    expect(
      getState()
        .question.ses_a?.map((q) => q.id)
        .sort(),
    ).toEqual(["que_1", "que_2"])
  })

  test("still applies an uncontested permission snapshot normally", async () => {
    const perm1 = { id: "perm_1", sessionID: "ses_a", permission: "bash" } as PermissionRequest
    const { getState, set } = makeHarness()

    const sdk = makeBaseSdk({
      permission: { list: vi.fn(async () => ({ data: [perm1] })) },
    })

    await bootstrapDirectory({
      directory: "/repo",
      sdk,
      getState,
      set,
      global: { projects: [{ id: "proj_1", worktree: "/repo" } as never] },
      loadSessions: () => undefined,
    })
    await flush()

    expect(getState().permission.ses_a?.map((p) => p.id)).toEqual(["perm_1"])
  })
})

describe("bootstrapDirectory — session status snapshot", () => {
  const boot = (harness: ReturnType<typeof makeHarness>, sdk: AxCodeClient) =>
    bootstrapDirectory({
      directory: "/repo",
      sdk,
      getState: harness.getState,
      set: harness.set,
      global: { projects: [{ id: "proj_1", worktree: "/repo" } as never] },
      loadSessions: () => undefined,
    })

  test("keeps a just-sent turn's status when the snapshot does not list it yet", async () => {
    // prompt_async returns before the turn registers as busy, so a snapshot taken in
    // that gap omits the session. Taking the snapshot wholesale flipped the
    // optimistic busy back to idle and the turn looked dead.
    wasPromptRecentlyAcceptedMock.mockImplementation((sessionId: string) => sessionId === "ses_a")
    const harness = makeHarness({ session_status: { ses_a: { type: "busy" }, ses_b: { type: "busy" } } })
    const sdk = makeBaseSdk({
      session: { status: vi.fn(async () => ({ data: { ses_b: { type: "busy" } } })) },
    })

    await boot(harness, sdk)
    await flush()

    expect(harness.getState().session_status.ses_a).toEqual({ type: "busy" })
    expect(harness.getState().session_status.ses_b).toEqual({ type: "busy" })
  })

  test("keeps a status the event stream changed while the snapshot was in flight", async () => {
    // The snapshot is computed before the request goes out, so a `session.status` event that lands while
    // it is in flight is newer than the answer. The poll path drops those entries
    // (pickApplicableResyncedStatuses); bootstrap applied the older view and a running turn showed as
    // idle with no Stop until the next event.
    wasPromptRecentlyAcceptedMock.mockReturnValue(false)
    const harness = makeHarness({ session_status: {} })
    const sdk = makeBaseSdk({
      session: {
        status: vi.fn(async () => {
          harness.set({ session_status: { ses_a: { type: "busy" } } })
          return { data: {} }
        }),
      },
    })

    await boot(harness, sdk)
    await flush()

    expect(harness.getState().session_status.ses_a).toEqual({ type: "busy" })
  })

  test("still settles a session the server omits once the grace window has passed", async () => {
    wasPromptRecentlyAcceptedMock.mockReturnValue(false)
    const harness = makeHarness({ session_status: { ses_a: { type: "busy" } } })
    const sdk = makeBaseSdk({ session: { status: vi.fn(async () => ({ data: {} })) } })

    await boot(harness, sdk)
    await flush()

    expect(harness.getState().session_status.ses_a).toEqual({ type: "idle" })
  })
})

describe("bootstrapDirectory — per-directory scoping", () => {
  test("asks the runtime about the bootstrapped directory, not its own cwd", async () => {
    const harness = makeHarness()
    const sdk = makeBaseSdk({
      project: { current: vi.fn(async () => ({ data: { id: "proj_b" } })) },
    })

    // The managed runtime serves several directories from one process and picks
    // the instance per request from the query/header, falling back to its own
    // cwd. Without the directory these snapshots describe whatever instance that
    // fallback selected, and the answer was merged into this store as if it
    // belonged here.
    await bootstrapDirectory({
      directory: "/work/project-b",
      sdk,
      getState: harness.getState,
      set: harness.set,
      global: { projects: [] },
      loadSessions: () => undefined,
    })
    await flush()

    expect(sdk.project.current).toHaveBeenCalledWith({ directory: "/work/project-b" })
    expect(sdk.path.get).toHaveBeenCalledWith({ directory: "/work/project-b" })
    expect(sdk.session.status).toHaveBeenCalledWith({ directory: "/work/project-b" })
    expect(sdk.lsp.status).toHaveBeenCalledWith({ directory: "/work/project-b" })
    expect(sdk.vcs.get).toHaveBeenCalledWith({ directory: "/work/project-b" })
  })
})

import { useWebMcpApprovalOutcomes } from "@/stores/useWebMcpApprovalOutcome"
test("an uncontested empty permission resync records the vanished call without assuming a timeout", async () => {
  useWebMcpApprovalOutcomes.setState({ calls: new Map() })
  const request = { id: "perm_expired", sessionID: "ses_expired", permission: "webmcp", tool: { callID: "call-expired", messageID: "message-1" } } as PermissionRequest
  const harness = makeHarness({ permission: { ses_expired: [request] } })
  await bootstrapDirectory({ directory: "/repo", sdk: makeBaseSdk(), ...harness,
    global: { projects: [{ id: "proj_1", worktree: "/repo" } as never] }, loadSessions: () => undefined })
  await flush()
  expect(harness.getState().permission.ses_expired).toBeUndefined()
  expect(useWebMcpApprovalOutcomes.getState().calls.get(JSON.stringify(["ses_expired", "call-expired"]))).toBe("unanswered")
  useWebMcpApprovalOutcomes.setState({ calls: new Map() })
})
