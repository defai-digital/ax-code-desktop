import { getSafeStorage } from "@/stores/utils/safeStorage"
import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import { I18nProvider } from "@/lib/i18n"
import type { RuntimeAPIs } from "@/lib/api/types"
import { axCodeClient } from "@/lib/ax-code/client"
import { useGitStore } from "@/stores/useGitStore"
import { useUIStore } from "@/stores/useUIStore"
import {
  REVIEW_PROGRESS_STORAGE_KEY,
  reviewContentSignature,
  useReviewProgressStore,
} from "@/stores/useReviewProgressStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { cleanup, fireEvent, render, screen } from "@/test/dom"

import { DiffView } from "./DiffView"
import { SessionChangesView, type SessionChangesModel } from "./SessionChangesView"

const DIRECTORY = "/repo"
const SESSION = "ses_1"

type SyncedDiff = Pick<typeof changedFile, "file" | "additions" | "deletions">
type MessageInfo = { id?: string; role?: string; summary?: { diffs?: SyncedDiff[] } }

const harness = vi.hoisted(() => ({
  width: 1280,
  paneRef: { current: null as HTMLDivElement | null },
  messages: [] as Array<MessageInfo & { info?: MessageInfo }>,
  messagesResolved: true,
  status: { type: "idle" } as { type: string } | undefined,
  sessionDiff: undefined as unknown[] | undefined,
  diff: vi.fn(),
  message: vi.fn(),
  messagesPage: vi.fn(),
}))

// Browser evidence reads the session transcript from sync state; it has its own tests.
vi.mock("@/components/views/git/ReviewLandingBrowserEvidence", () => ({ ReviewLandingBrowserEvidence: () => null }))
vi.mock("@/hooks/useElementWidth", () => ({
  useElementWidth: () => ({ ref: harness.paneRef, width: harness.width }),
}))

vi.mock("@/hooks/useEffectiveDirectory", () => ({
  useEffectiveDirectory: () => DIRECTORY,
}))

vi.mock("@/sync/sync-context", () => ({
  useSession: () => undefined,
  useSessionMessages: () => harness.messages,
  useSessionMessagesResolved: () => harness.messagesResolved,
  useSessionStatus: () => harness.status,
  useDirectorySync: (selector: (state: { session_diff: Record<string, unknown[] | undefined> }) => unknown) =>
    selector({
      session_diff: harness.sessionDiff === undefined ? {} : { [SESSION]: harness.sessionDiff },
    }),
  useSessionDirectory: () => DIRECTORY,
}))

vi.mock("./PierreDiffViewer", () => ({
  PierreDiffViewer: (props: {
    original: string
    modified: string
    language: string
    renderSideBySide: boolean
    fileName?: string
  }) =>
    React.createElement("div", {
      "data-testid": "session-diff",
      "data-original": props.original,
      "data-modified": props.modified,
      "data-language": props.language,
      "data-side-by-side": String(props.renderSideBySide),
      "data-file": props.fileName ?? "",
    }),
}))

const gitApi = {
  checkIsGitRepository: vi.fn(async () => true),
  getGitStatus: vi.fn(async () => ({
    current: "main",
    tracking: null,
    ahead: 0,
    behind: 0,
    files: [],
    isClean: true,
  })),
  getGitBranches: vi.fn(async () => ({})),
  getGitLog: vi.fn(async () => ({ commits: [] })),
  getCurrentGitIdentity: vi.fn(async () => null),
  getGitFileDiff: vi.fn(async () => ({ original: "", modified: "", path: "" })),
  getGitDiff: vi.fn(async () => ({ diff: "" })),
}

function seedGit() {
  const now = Date.now()
  useGitStore.setState({
    activeDirectory: DIRECTORY,
    directories: new Map([
      [
        DIRECTORY,
        {
          isGitRepo: true,
          status: { current: "main", tracking: null, ahead: 0, behind: 0, files: [], isClean: true },
          branches: null,
          log: null,
          identity: null,
          diffCache: new Map(),
          indexRevision: 0,
          lastRepoCheckAt: now,
          lastStatusFetch: now,
          lastStatusChange: 0,
          lastLogFetch: now,
          lastBranchesFetch: now,
          lastIdentityFetch: now,
          logMaxCount: 25,
          isLoadingStatus: false,
          isLoadingLog: false,
          isLoadingBranches: false,
          isLoadingIdentity: false,
        },
      ],
    ]),
  })
}

async function flush() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function ReviewHarness() {
  return (
    <I18nProvider>
      <RuntimeAPIContext.Provider value={{ git: gitApi, files: {} } as unknown as RuntimeAPIs}>
        <DiffView />
      </RuntimeAPIContext.Provider>
    </I18nProvider>
  )
}

function renderReview() {
  return render(<ReviewHarness />)
}

const changedFile = {
  file: "src/a.ts",
  before: "const value = 1\n",
  after: "const value = 2\n",
  additions: 1,
  deletions: 1,
  status: "modified" as const,
}

function syncedDiff({ file, additions, deletions }: SyncedDiff): SyncedDiff {
  return { file, additions, deletions }
}

function turnResult(files: Array<typeof changedFile>) {
  return { data: { info: { id: "msg_last", role: "user", summary: { diffs: files } }, parts: [] } }
}

// React Compiler reuses a child element whose props did not change, so re-rendering the harness
// with static props no longer pushes new mock values into the view. Bump a real prop on every
// explicit re-render to deliver the update the production hook's subscription would.
let rerenderCount = 0
const rerenderPaneWidth = (width: number) => width + ++rerenderCount

function SessionHarness({ scope, paneWidth }: { scope: "session" | "turn"; paneWidth: number }) {
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const onModelChange = React.useCallback((model: SessionChangesModel) => {
    setSelected((current) => {
      if (current && model.files.some((file) => file.path === current)) return current
      return model.files[0]?.path ?? null
    })
  }, [])
  return (
    <I18nProvider>
      <RuntimeAPIContext.Provider value={{ git: gitApi, files: {} } as unknown as RuntimeAPIs}>
        <div ref={paneRef} tabIndex={0} data-review-changes>
          <SessionChangesView
            directory={DIRECTORY}
            sessionID={SESSION}
            scope={scope}
            paneRef={paneRef}
            paneWidth={paneWidth}
            allowRail
            selectedFile={selected}
            onSelectFile={setSelected}
            wrapLines={false}
            onModelChange={onModelChange}
          />
        </div>
      </RuntimeAPIContext.Provider>
    </I18nProvider>
  )
}

describe("session and last-turn review scopes", () => {
  beforeEach(() => {
    harness.width = 1280
    harness.messages = []
    harness.messagesResolved = true
    harness.status = { type: "idle" }
    harness.sessionDiff = undefined
    harness.diff.mockReset()
    harness.diff.mockResolvedValue({ data: [] })
    harness.message.mockReset()
    harness.message.mockResolvedValue(turnResult([]))
    harness.messagesPage.mockReset()
    harness.messagesPage.mockResolvedValue({ data: [] })
    vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({
      session: { diff: harness.diff, message: harness.message, messages: harness.messagesPage },
    } as never)
    useSessionUIStore.setState({ currentSessionId: null })
    useReviewProgressStore.setState({ marks: {} })
    useUIStore.setState({ diffLayoutPreference: "inline", diffFileLayout: {}, diffWrapLines: false })
    seedGit()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test("the scope selector shows this session and last turn only when a session is current", () => {
    renderReview()
    expect(screen.getByRole("radio", { name: "All" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "Unstaged" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Staged" })).toBeTruthy()
    expect(screen.queryByRole("radio", { name: "This session" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "Last turn" })).toBeNull()

    cleanup()
    useSessionUIStore.setState({ currentSessionId: SESSION })
    renderReview()
    expect(screen.getByRole("radio", { name: "This session" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Last turn" })).toBeTruthy()
    expect(screen.getByRole("radiogroup", { name: "Changes to show" })).toBeTruthy()

    cleanup()
    render(
      <I18nProvider>
        <RuntimeAPIContext.Provider value={{ git: gitApi, files: {} } as unknown as RuntimeAPIs}>
          <DiffView diffScope="working" />
        </RuntimeAPIContext.Provider>
      </I18nProvider>,
    )
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("radio", { name: "This session" })).toBeNull()
  })

  test("the session and turn selectors load runtime content into a read-only viewer", async () => {
    const turnFile = { ...changedFile, file: "src/turn.ts", before: "turn before\n", after: "turn after\n" }
    harness.messages = [
      { id: "msg_old", role: "user", summary: { diffs: [syncedDiff(changedFile)] } },
      { id: "msg_last", role: "user", summary: { diffs: [syncedDiff(turnFile)] } },
      { id: "msg_assistant", role: "assistant" },
    ]
    harness.sessionDiff = [syncedDiff(changedFile)]
    harness.diff.mockResolvedValue({
      data: [changedFile, { ...changedFile, file: "src/b.ts", additions: 4, deletions: 0 }],
    })
    harness.message.mockResolvedValue(turnResult([turnFile]))
    useSessionUIStore.setState({ currentSessionId: SESSION })
    const view = renderReview()

    fireEvent.click(screen.getByRole("radio", { name: "This session" }))
    await flush()

    expect(axCodeClient.getScopedSdkClient).toHaveBeenCalledWith(DIRECTORY)
    expect(harness.diff).toHaveBeenCalledTimes(1)
    expect(harness.diff).toHaveBeenCalledWith({ sessionID: SESSION, directory: DIRECTORY })
    expect(harness.message).not.toHaveBeenCalled()
    expect(screen.getByText("2 files changed")).toBeTruthy()
    expect(screen.getByText("a.ts")).toBeTruthy()
    expect(screen.getByTestId("session-diff").getAttribute("data-original")).toBe(changedFile.before)
    expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)
    expect(screen.getByTestId("session-diff").getAttribute("data-language")).toBe("typescript")
    expect(screen.getByTestId("session-diff").getAttribute("data-side-by-side")).toBe("false")
    expect(screen.queryByRole("button", { name: "Stage change 1" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Revert change 1" })).toBeNull()

    view.rerender(<ReviewHarness />)
    await flush()
    expect(harness.diff).toHaveBeenCalledTimes(1)

    harness.diff.mockClear()
    fireEvent.click(screen.getByRole("radio", { name: "Last turn" }))
    await flush()
    expect(harness.diff).not.toHaveBeenCalled()
    expect(harness.message).toHaveBeenCalledWith({ sessionID: SESSION, messageID: "msg_last", directory: DIRECTORY })
    expect(screen.getByText("1 file changed")).toBeTruthy()
    expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe(turnFile.file)
    expect(screen.getByTestId("session-diff").getAttribute("data-original")).toBe(turnFile.before)
    expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(turnFile.after)
    expect(screen.queryByRole("button", { name: "Stage change 1" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Revert change 1" })).toBeNull()
    expect(document.querySelector("[data-session-scope]")?.getAttribute("data-session-scope")).toBe("turn:msg_last")
  })

  test.each([
    { name: "absent", entry: undefined },
    { name: "empty", entry: [] },
    { name: "sanitized", entry: [syncedDiff(changedFile)] },
  ])("this session always fetches content when session_diff is $name", async ({ entry }) => {
    harness.sessionDiff = entry
    harness.messagesResolved = false
    harness.diff.mockResolvedValue({ data: [changedFile] })
    const view = render(<SessionHarness scope="session" paneWidth={1200} />)
    await flush()
    expect(harness.diff).toHaveBeenCalledExactlyOnceWith({ sessionID: SESSION, directory: DIRECTORY })
    expect(harness.message).not.toHaveBeenCalled()
    expect(screen.getByTestId("session-diff").getAttribute("data-original")).toBe(changedFile.before)
    expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)

    view.rerender(<SessionHarness scope="session" paneWidth={rerenderPaneWidth(1200)} />)
    await flush()
    expect(harness.diff).toHaveBeenCalledTimes(1)
  })

  test.each(["sdk", "wrapped"] as const)(
    "last turn fetches the latest %s user message and ignores session_diff",
    async (shape) => {
      const message = (info: MessageInfo) => (shape === "wrapped" ? { info } : info)
      const turnFile = { ...changedFile, file: "src/turn.ts", before: "turn before\n", after: "turn only\n" }
      harness.sessionDiff = [syncedDiff(changedFile)]
      harness.diff.mockResolvedValue({ data: [changedFile] })
      harness.message.mockResolvedValue(turnResult([turnFile]))
      harness.messages = [
        message({ id: "msg_old", role: "user", summary: { diffs: [syncedDiff(changedFile)] } }),
        message({ id: "msg_last", role: "user", summary: { diffs: [syncedDiff(turnFile)] } }),
        message({ id: "msg_assistant", role: "assistant", summary: { diffs: [syncedDiff(changedFile)] } }),
      ]
      const view = render(<SessionHarness scope="turn" paneWidth={1200} />)
      await flush()
      expect(axCodeClient.getScopedSdkClient).toHaveBeenCalledWith(DIRECTORY)
      expect(harness.message).toHaveBeenCalledExactlyOnceWith({
        sessionID: SESSION,
        messageID: "msg_last",
        directory: DIRECTORY,
      })
      expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe(turnFile.file)
      expect(screen.getByTestId("session-diff").getAttribute("data-original")).toBe(turnFile.before)
      expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(turnFile.after)
      expect(screen.queryByText("a.ts")).toBeNull()
      expect(document.querySelector("[data-session-scope]")?.getAttribute("data-session-scope")).toBe("turn:msg_last")
      expect(harness.diff).not.toHaveBeenCalled()

      harness.sessionDiff = []
      view.rerender(<SessionHarness scope="turn" paneWidth={rerenderPaneWidth(1200)} />)
      await flush()
      expect(harness.message).toHaveBeenCalledTimes(1)

      harness.message.mockResolvedValue(turnResult([changedFile]))
      // A user with no synced summary must still fetch its full runtime message.
      harness.messages = [...harness.messages, message({ id: "msg_next", role: "user" })]
      view.rerender(<SessionHarness scope="turn" paneWidth={rerenderPaneWidth(1200)} />)
      await flush()
      expect(harness.message).toHaveBeenLastCalledWith({
        sessionID: SESSION,
        messageID: "msg_next",
        directory: DIRECTORY,
      })
      expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe(changedFile.file)
      expect(document.querySelector("[data-session-scope]")?.getAttribute("data-session-scope")).toBe("turn:msg_next")
      expect(harness.diff).not.toHaveBeenCalled()
    },
  )

  test("last turn asks the runtime for the latest user message when synced messages never resolve", async () => {
    // Windows: the session's messages can be synced under another spelling of its directory, so this pane never sees them
    // resolve. The turn must still load instead of showing "Loading changes" forever.
    harness.messagesResolved = false
    harness.messagesPage.mockResolvedValue({
      data: [{ info: { id: "msg_old", role: "user" } }, { info: { id: "msg_rt", role: "user" } }, { info: { id: "a", role: "assistant" } }],
    })
    harness.message.mockResolvedValue(turnResult([changedFile]))
    render(<SessionHarness scope="turn" paneWidth={1200} />)
    await flush()
    expect(harness.messagesPage).not.toHaveBeenCalled()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600))
    })
    await flush()
    expect(harness.messagesPage).toHaveBeenCalledExactlyOnceWith({ sessionID: SESSION, directory: DIRECTORY, limit: 50 })
    expect(harness.message).toHaveBeenCalledExactlyOnceWith({ sessionID: SESSION, messageID: "msg_rt", directory: DIRECTORY })
    expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)
    expect(document.querySelector("[data-session-scope]")?.getAttribute("data-session-scope")).toBe("turn:msg_rt")
  })

  test.each([false, true])(
    "last turn stays loading until messages resolve (synced user present: %s)",
    async (hasUser) => {
      harness.messagesResolved = false
      harness.messages = hasUser
        ? [{ id: "msg_last", role: "user", summary: { diffs: [syncedDiff(changedFile)] } }]
        : []
      let resolveMessage!: (result: ReturnType<typeof turnResult>) => void
      harness.message.mockReturnValue(
        new Promise<ReturnType<typeof turnResult>>((resolve) => {
          resolveMessage = resolve
        }),
      )
      const view = render(<SessionHarness scope="turn" paneWidth={1200} />)
      await flush()
      expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true")
      expect(screen.queryByText("The agent has not changed files in its last turn")).toBeNull()
      expect(document.querySelector('[data-testid="session-diff"]')).toBeNull()
      expect(harness.diff).not.toHaveBeenCalled()
      expect(harness.message).not.toHaveBeenCalled()

      harness.messagesResolved = true
      view.rerender(<SessionHarness scope="turn" paneWidth={rerenderPaneWidth(1200)} />)
      await flush()
      if (hasUser) {
        expect(harness.message).toHaveBeenCalledExactlyOnceWith({
          sessionID: SESSION,
          messageID: "msg_last",
          directory: DIRECTORY,
        })
        expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true")
        await act(async () => resolveMessage(turnResult([changedFile])))
        await flush()
        expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)
      } else {
        expect(screen.getByText("The agent has not changed files in its last turn")).toBeTruthy()
        expect(harness.message).not.toHaveBeenCalled()
      }
      expect(document.querySelector('[aria-busy="true"]')).toBeNull()
      expect(harness.diff).not.toHaveBeenCalled()
    },
  )

  test.each([
    { name: "no messages", messages: [] },
    { name: "only an assistant", messages: [{ id: "msg_assistant", role: "assistant" }] },
    { name: "only a wrapped assistant", messages: [{ info: { id: "msg_assistant", role: "assistant" } }] },
  ])("resolved last turn is empty without any request with $name", async ({ messages }) => {
    harness.messages = messages
    harness.sessionDiff = [syncedDiff(changedFile)]
    render(<SessionHarness scope="turn" paneWidth={1200} />)
    await flush()
    expect(screen.getByText("The agent has not changed files in its last turn")).toBeTruthy()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect(harness.diff).not.toHaveBeenCalled()
    expect(harness.message).not.toHaveBeenCalled()
    expect(axCodeClient.getScopedSdkClient).not.toHaveBeenCalled()
  })

  test.each([
    { name: "no summary", info: { id: "msg_last", role: "user" } },
    { name: "no diffs", info: { summary: {} } },
    { name: "empty diffs", info: { summary: { diffs: [] } } },
  ])("last turn is empty when the runtime message has $name", async ({ info }) => {
    harness.messages = [{ id: "msg_last", role: "user", summary: { diffs: [syncedDiff(changedFile)] } }]
    harness.message.mockResolvedValue({ data: { info, parts: [] } })
    render(<SessionHarness scope="turn" paneWidth={1200} />)
    await flush()
    expect(screen.getByText("The agent has not changed files in its last turn")).toBeTruthy()
    expect(harness.message).toHaveBeenCalledExactlyOnceWith({
      sessionID: SESSION,
      messageID: "msg_last",
      directory: DIRECTORY,
    })
    expect(harness.diff).not.toHaveBeenCalled()
  })

  test.each(["This session", "Last turn"])("switching sessions resets %s to All", async (scope) => {
    useSessionUIStore.setState({ currentSessionId: SESSION })
    harness.sessionDiff = [syncedDiff(changedFile)]
    harness.messages = [{ id: "msg_last", role: "user", summary: { diffs: [syncedDiff(changedFile)] } }]
    harness.diff.mockResolvedValue({ data: [changedFile] })
    harness.message.mockResolvedValue(turnResult([changedFile]))
    renderReview()
    fireEvent.click(screen.getByRole("radio", { name: scope }))
    await flush()
    expect(screen.getByRole("radio", { name: scope }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByTestId("session-diff")).toBeTruthy()

    act(() => useSessionUIStore.setState({ currentSessionId: "ses_2" }))
    await flush()
    expect(screen.getByRole("radio", { name: "All" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: scope }).getAttribute("aria-checked")).toBe("false")
    expect(document.querySelector("[data-session-changes]")).toBeNull()
  })

  test("shows an empty session from the runtime even when sync lists files", async () => {
    useSessionUIStore.setState({ currentSessionId: SESSION })
    harness.sessionDiff = [syncedDiff(changedFile)]
    renderReview()
    fireEvent.click(screen.getByRole("radio", { name: "This session" }))
    await flush()
    expect(screen.getByText("The agent has not changed files in this session")).toBeTruthy()
    expect(screen.getByText("0 files changed")).toBeTruthy()
    expect(harness.diff).toHaveBeenCalledExactlyOnceWith({ sessionID: SESSION, directory: DIRECTORY })
    expect(harness.message).not.toHaveBeenCalled()
  })

  describe.each(["session", "turn"] as const)("%s refresh and recovery", (scope) => {
    const renderScope = () => <SessionHarness scope={scope} paneWidth={rerenderPaneWidth(1200)} />
    const request = () => (scope === "session" ? harness.diff : harness.message)
    const result = (files: Array<typeof changedFile>) => (scope === "session" ? { data: files } : turnResult(files))
    const signal = (files: SyncedDiff[]) => {
      if (scope === "session") harness.sessionDiff = files
      else harness.messages = [{ id: "msg_last", role: "user", summary: { diffs: files } }]
    }
    const expectRequests = (count: number) => {
      expect(request()).toHaveBeenCalledTimes(count)
      expect(request()).toHaveBeenLastCalledWith(
        scope === "session"
          ? { sessionID: SESSION, directory: DIRECTORY }
          : { sessionID: SESSION, messageID: "msg_last", directory: DIRECTORY },
      )
      expect(scope === "session" ? harness.message : harness.diff).not.toHaveBeenCalled()
    }

    beforeEach(() => {
      harness.messages = [{ id: "msg_last", role: "user" }]
      request().mockResolvedValue(result([changedFile]))
    })

    test("a changed sanitized summary refetches content while idle", async () => {
      signal([syncedDiff(changedFile)])
      const view = render(renderScope())
      await flush()
      expectRequests(1)
      const refreshed = { ...changedFile, after: "runtime refresh\n" }
      request().mockResolvedValue(result([refreshed]))
      signal([syncedDiff(refreshed)])
      view.rerender(renderScope())
      await flush()
      expectRequests(2)
      expect(screen.getByTestId("session-diff").getAttribute("data-original")).toBe(refreshed.before)
      expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(refreshed.after)

      view.rerender(renderScope())
      await flush()
      expectRequests(2)
    })

    test.each(["busy", "retry"])("%s suppresses changed-summary refetches and idle refetches once", async (status) => {
      harness.status = { type: status }
      signal([syncedDiff(changedFile)])
      const view = render(renderScope())
      await flush()
      expectRequests(1)
      const refreshed = { ...changedFile, after: "completed turn\n" }
      request().mockResolvedValue(result([refreshed]))

      for (const files of [[], [syncedDiff(refreshed)]]) {
        signal(files)
        view.rerender(renderScope())
        await flush()
        expectRequests(1)
        expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)
      }

      // Coalesce a final summary change and the idle transition into one request.
      signal([syncedDiff(refreshed)])
      harness.status = { type: "idle" }
      view.rerender(renderScope())
      await flush()
      expectRequests(2)
      expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(refreshed.after)
      view.rerender(renderScope())
      await flush()
      expectRequests(2)
    })

    test.each(["busy", "retry"])("%s to idle refetches once even without a synced summary", async (status) => {
      harness.status = { type: status }
      const view = render(renderScope())
      await flush()
      expectRequests(1)
      harness.status = { type: "idle" }
      view.rerender(renderScope())
      await flush()
      expectRequests(2)
      view.rerender(renderScope())
      await flush()
      expectRequests(2)
    })

    test("an API error exposes Retry and retries the same scoped endpoint", async () => {
      request().mockRejectedValueOnce(new Error("diff unavailable"))
      render(renderScope())
      await flush()
      expect(screen.getByRole("alert").textContent).toContain("Failed to load diff")
      expect(screen.getByRole("alert").textContent).toContain("diff unavailable")
      expectRequests(1)
      fireEvent.click(screen.getByRole("button", { name: "Retry" }))
      await flush()
      expectRequests(2)
      expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)
      expect(screen.queryByRole("alert")).toBeNull()
    })

    test.each(["before-only", "identical"])("%s content after reload updates viewed state", async (change) => {
      signal([syncedDiff(changedFile)])
      request().mockResolvedValue(result([changedFile]))
      render(renderScope())
      await flush()
      fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
      const saved = getSafeStorage().getItem(REVIEW_PROGRESS_STORAGE_KEY)!
      cleanup()
      useReviewProgressStore.setState({ marks: {} })
      getSafeStorage().setItem(REVIEW_PROGRESS_STORAGE_KEY, saved)
      await useReviewProgressStore.persist.rehydrate()

      const refreshed = { ...changedFile, before: change === "before-only" ? "const value = 0\n" : changedFile.before }
      request().mockResolvedValue(result([refreshed]))
      render(renderScope())
      await flush()
      expect(screen.getByTestId("session-diff").getAttribute("data-original")).toBe(refreshed.before)
      expect((screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement).checked).toBe(
        change === "identical",
      )
    })

    test.each(["idle", "Retry"])(
      "viewed resets after a %s refetch changes content with identical counts",
      async (refresh) => {
        harness.status = { type: "busy" }
        signal([syncedDiff(changedFile)])
        const view = render(renderScope())
        await flush()
        const checkbox = screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement
        fireEvent.click(checkbox)
        expect(checkbox.checked).toBe(true)
        const progressScope = scope === "session" ? "session" : "turn:msg_last"
        const signature = reviewContentSignature(
          changedFile.before,
          changedFile.after,
          changedFile.status,
          changedFile.file,
        )
        expect(useReviewProgressStore.getState().isViewed(DIRECTORY, progressScope, changedFile.file, signature)).toBe(
          true,
        )

        const rewritten = { ...changedFile, after: "const value = 3\n" }
        request().mockResolvedValue(result([rewritten]))
        signal([syncedDiff(rewritten)])
        view.rerender(renderScope())
        await flush()
        expectRequests(1)
        expect(checkbox.checked).toBe(true)
        expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(changedFile.after)

        if (refresh === "Retry") request().mockRejectedValueOnce(new Error("refresh failed"))
        harness.status = { type: "idle" }
        view.rerender(renderScope())
        await flush()
        if (refresh === "Retry") {
          expect(screen.getByRole("alert").textContent).toContain("refresh failed")
          fireEvent.click(screen.getByRole("button", { name: "Retry" }))
          await flush()
        }
        expectRequests(refresh === "Retry" ? 3 : 2)
        expect((screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement).checked).toBe(false)
        expect(
          useReviewProgressStore
            .getState()
            .isViewed(
              DIRECTORY,
              progressScope,
              changedFile.file,
              reviewContentSignature(rewritten.before, rewritten.after, rewritten.status, rewritten.file),
            ),
        ).toBe(false)
        expect(screen.getByTestId("session-diff").getAttribute("data-modified")).toBe(rewritten.after)
      },
    )
  })

  test("[ ] and v move the session diff and side-by-side needs width plus both sides", async () => {
    harness.messages = [{ id: "msg_last", role: "user" }]
    harness.diff.mockResolvedValue({
      data: [
        changedFile,
        { file: "src/b.ts", before: "old\n", after: "new\n", additions: 1, deletions: 1, status: "added" },
        { file: "src/new.ts", before: "", after: "created\n", additions: 1, deletions: 0, status: "added" },
      ],
    })
    useUIStore.setState({ diffLayoutPreference: "dynamic" })
    const view = render(<SessionHarness scope="session" paneWidth={1200} />)
    await flush()

    const pane = document.querySelector("[data-review-changes]") as HTMLElement
    pane.focus()
    expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe("src/a.ts")
    expect(screen.getByTestId("session-diff").getAttribute("data-side-by-side")).toBe("true")
    expect(
      screen.getByRole("treeitem", { current: true }).querySelector("[aria-label='Modified file']")?.textContent,
    ).toBe("M")

    fireEvent.keyDown(pane, { key: "]" })
    expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe("src/b.ts")
    expect(screen.getByRole("treeitem", { current: true }).querySelector("[aria-label='New file']")?.textContent).toBe(
      "A",
    )
    fireEvent.keyDown(pane, { key: "[" })
    expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe("src/a.ts")

    fireEvent.keyDown(pane, { key: "v" })
    expect((screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe("src/b.ts")

    view.rerender(<SessionHarness scope="session" paneWidth={800} />)
    await flush()
    fireEvent.keyDown(pane, { key: "[" })
    fireEvent.keyDown(pane, { key: "[" })
    expect(screen.getByTestId("session-diff").getAttribute("data-side-by-side")).toBe("false")

    view.rerender(<SessionHarness scope="session" paneWidth={1400} />)
    await flush()
    fireEvent.click(document.querySelector("[data-review-file='src/new.ts'] .review-file-rail__select") as HTMLElement)
    expect(screen.getByTestId("session-diff").getAttribute("data-file")).toBe("src/new.ts")
    expect(screen.getByTestId("session-diff").getAttribute("data-side-by-side")).toBe("false")
  })

  test("switching from This session to Last turn requests the turn once", async () => {
    // Realistic synced state: both scopes have their own (stripped) summary signal.
    harness.sessionDiff = [{ file: changedFile.file }]
    harness.messages = [{ id: "msg_last", role: "user", summary: { diffs: [{ file: changedFile.file }] } }] as never
    harness.diff.mockResolvedValue({ data: [changedFile] })
    harness.message.mockResolvedValue({
      data: { info: { id: "msg_last", role: "user", summary: { diffs: [changedFile] } } },
    })
    useSessionUIStore.setState({ currentSessionId: SESSION })
    renderReview()
    fireEvent.click(screen.getByRole("radio", { name: "This session" }))
    await flush()
    fireEvent.click(screen.getByRole("radio", { name: "Last turn" }))
    await flush()
    expect(harness.message).toHaveBeenCalledTimes(1)
  })
})
