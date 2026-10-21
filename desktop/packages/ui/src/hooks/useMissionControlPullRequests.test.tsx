import React, { act } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import type { GitHubAPI, GitHubPullRequestStatus, RuntimeAPIs } from "@/lib/api/types"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useGitHubPrStatusStore } from "@/stores/useGitHubPrStatusStore"
import { useMissionControlPullRequests } from "./useMissionControlPullRequests"

let branches = new Map<string, string | null>()
vi.mock("@/stores/useGitStore", () => ({ useGitAllBranches: () => branches }))
const row = (sessionId: string, directory = "/repo"): SupervisionRow => ({
  sessionId,
  directory,
  title: sessionId,
  state: "running",
  updatedAt: 1,
  treeSessionIds: [sessionId],
  projectId: null,
  projectLabel: null,
  evidence: null,
  goal: null,
})
const status: GitHubPullRequestStatus = {
  connected: true,
  pr: {
    number: 42,
    title: "PR",
    state: "open",
    draft: false,
    url: "https://example.test",
    base: "main",
    head: "feature",
  },
  checks: { state: "pending", total: 1, success: 0, failure: 0, pending: 1 },
}
function known(directory: string, branch: string, github: GitHubAPI, key = directory) {
  const store = useGitHubPrStatusStore.getState()
  store.setParams(key, {
    directory,
    branch,
    remoteName: "origin",
    canShow: true,
    github,
    githubAuthChecked: true,
    githubConnected: true,
  })
  store.updateStatus(key, () => status)
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  useGitHubPrStatusStore.setState({ entries: {} })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useGitHubPrStatusStore.setState({ entries: {} })
})
const flush = () =>
  act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })

test("only demands visible known PRs, reuses the runtime API/cache and projects the same branch to duplicate sessions", async () => {
  const fetch = vi.fn(async () => ({ ...status, checks: { ...status.checks!, state: "success" as const } }))
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("/repo", "feature", github)
  known("/hidden", "feature", github)
  branches = new Map([
    ["/repo", "feature"],
    ["/hidden", "feature"],
    ["/unknown", "feature"],
  ])
  const rows = [row("a"), row("b"), row("hidden", "/hidden"), row("unknown", "/unknown")]
  function Harness({ visible }: { visible: string[] }) {
    const { rows: projected, setVisibleRows } = useMissionControlPullRequests(rows)
    React.useEffect(() => setVisibleRows(rows.filter((r) => visible.includes(r.sessionId))), [setVisibleRows, visible])
    return (
      <>
        {projected.map((r) => (
          <span key={r.sessionId} data-session={r.sessionId}>
            {r.pullRequest?.checks}
          </span>
        ))}
      </>
    )
  }
  const { container, rerender } = render(
    <RuntimeAPIContext.Provider value={{ github } as RuntimeAPIs}>
      <Harness visible={["a", "b", "unknown"]} />
    </RuntimeAPIContext.Provider>,
  )
  await flush()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith("/repo", "feature", "origin", { signal: expect.any(AbortSignal) })
  expect(container.querySelector('[data-session="a"]')?.textContent).toBe("passed")
  expect(container.querySelector('[data-session="b"]')?.textContent).toBe("passed")
  expect(container.querySelector('[data-session="unknown"]')?.textContent).toBe("")
  expect(useGitHubPrStatusStore.getState().entries["/repo"].status?.checks?.state).toBe("success")
  rerender(
    <RuntimeAPIContext.Provider value={{ github } as RuntimeAPIs}>
      <Harness visible={[]} />
    </RuntimeAPIContext.Provider>,
  )
  await vi.advanceTimersByTimeAsync(200_000)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test("normalizes Windows directory identity and never carries PR data across a branch or directory change", async () => {
  const fetch = vi.fn(async () => status)
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("c:\\Work\\Repo\\", "feature", github)
  branches = new Map([["C:/work/repo", "feature"]])
  function Harness({ directory }: { directory: string }) {
    const { rows: projected } = useMissionControlPullRequests([row("a", directory)])
    return <span>{projected[0].pullRequest?.number}</span>
  }
  const { container, rerender } = render(<Harness directory="C:/work/repo/" />)
  expect(container.textContent).toBe("42")
  branches = new Map([["C:/work/repo", "other"]])
  rerender(<Harness directory="C:/work/repo/" />)
  expect(container.textContent).toBe("")
  rerender(<Harness directory="/unrelated" />)
  expect(container.textContent).toBe("")
  expect(fetch).not.toHaveBeenCalled()
})

test("uses fresh existing status without a request until the shared TTL expires", async () => {
  const fetch = vi.fn(async () => status)
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("/repo", "feature", github)
  useGitHubPrStatusStore.getState().updateStatus("/repo", () => status, Date.now())
  branches = new Map([["/repo", "feature"]])
  const rows = [row("a")]
  function Harness() {
    const { rows: projected, setVisibleRows } = useMissionControlPullRequests(rows)
    React.useEffect(() => setVisibleRows(rows), [setVisibleRows])
    return <span>{projected[0].pullRequest?.number}</span>
  }
  const { container } = render(
    <RuntimeAPIContext.Provider value={{ github } as RuntimeAPIs}>
      <Harness />
    </RuntimeAPIContext.Provider>,
  )
  expect(container.textContent).toBe("42")
  await flush()
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(89_999)
  })
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test("a late response after timeout cannot write into the shared PR cache", async () => {
  let finish!: (value: GitHubPullRequestStatus) => void
  const fetch = vi.fn(
    () =>
      new Promise<GitHubPullRequestStatus>((resolve) => {
        finish = resolve
      }),
  )
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("/repo", "feature", github)
  branches = new Map([["/repo", "feature"]])
  const rows = [row("a")]
  function Harness() {
    const { rows: projected, setVisibleRows } = useMissionControlPullRequests(rows)
    React.useEffect(() => setVisibleRows(rows), [setVisibleRows])
    return <span data-stale={String(projected[0].pullRequest?.stale)}>{projected[0].pullRequest?.number}</span>
  }
  const { container } = render(
    <RuntimeAPIContext.Provider value={{ github } as RuntimeAPIs}>
      <Harness />
    </RuntimeAPIContext.Provider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000)
  })
  expect(container.querySelector("span")?.dataset.stale).toBe("true")
  await act(async () => {
    finish({ ...status, pr: { ...status.pr!, number: 99 } })
    await Promise.resolve()
  })
  expect(useGitHubPrStatusStore.getState().entries["/repo"].status?.pr?.number).toBe(42)
  expect(container.textContent).toBe("42")
})

test("a slower board response does not overwrite a newer PR read from the existing integration", async () => {
  let finish!: (value: GitHubPullRequestStatus) => void
  const github = {
    prStatus: vi.fn(
      () =>
        new Promise<GitHubPullRequestStatus>((resolve) => {
          finish = resolve
        }),
    ),
  } as unknown as GitHubAPI
  known("/repo", "feature", github)
  branches = new Map([["/repo", "feature"]])
  const rows = [row("a")]
  function Harness() {
    const { rows: projected, setVisibleRows } = useMissionControlPullRequests(rows)
    React.useEffect(() => setVisibleRows(rows), [setVisibleRows])
    return <span>{projected[0].pullRequest?.number}</span>
  }
  const { container } = render(
    <RuntimeAPIContext.Provider value={{ github } as RuntimeAPIs}>
      <Harness />
    </RuntimeAPIContext.Provider>,
  )
  await act(async () => {
    vi.setSystemTime(100_100)
    useGitHubPrStatusStore
      .getState()
      .updateStatus("/repo", () => ({ ...status, pr: { ...status.pr!, number: 99 } }), Date.now())
    finish(status)
    await Promise.resolve()
  })
  expect(useGitHubPrStatusStore.getState().entries["/repo"].status?.pr?.number).toBe(99)
  expect(container.textContent).toBe("99")
})

test("a board read without a body keeps the body the PR section loaded, and the chip ages into stale", async () => {
  const fetch = vi.fn(async () => status)
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("/repo", " feature ", github)
  useGitHubPrStatusStore
    .getState()
    .updateStatus("/repo", () => ({ ...status, pr: { ...status.pr!, body: "Loaded body" } }), Date.now())
  branches = new Map([["/repo", "feature"]])
  const rows = [row("a")]
  function Harness() {
    const { rows: projected, setVisibleRows } = useMissionControlPullRequests(rows)
    React.useEffect(() => setVisibleRows(rows), [setVisibleRows])
    const pr = projected[0].pullRequest
    return <span>{pr ? `${pr.number}:${pr.stale ? "stale" : "fresh"}` : "none"}</span>
  }
  const { container } = render(
    <RuntimeAPIContext.Provider value={{ github } as RuntimeAPIs}>
      <Harness />
    </RuntimeAPIContext.Provider>,
  )
  expect(container.textContent).toBe("42:fresh")
  // Without a fetch the projection must still age past the freshness window.
  fetch.mockImplementation(() => new Promise<GitHubPullRequestStatus>(() => {}))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90_000)
  })
  expect(container.textContent).toBe("42:stale")
  fetch.mockImplementation(async () => status)
  // The hung read times out after 20 s and backs off for 30 s before the next read.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  await flush()
  expect(fetch).toHaveBeenCalled()
  expect(useGitHubPrStatusStore.getState().entries["/repo"].status?.pr?.body).toBe("Loaded body")
})
