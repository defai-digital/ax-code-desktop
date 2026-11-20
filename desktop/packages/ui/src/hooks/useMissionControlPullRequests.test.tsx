import React, { act } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import type { GitHubAPI, GitHubPullRequestStatus, RuntimeAPIs } from "@/lib/api/types"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useGitHubPrStatusStore } from "@/stores/useGitHubPrStatusStore"
import { useKnownPullRequest, useMissionControlPullRequests } from "./useMissionControlPullRequests"

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
function known(directory: string, branch: string, github: GitHubAPI, key = directory, remoteName = "origin") {
  const store = useGitHubPrStatusStore.getState()
  store.setParams(key, {
    directory,
    branch,
    remoteName,
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

test("a timeout does not make an older board snapshot newer than a shared read", async () => {
  const fetch = vi.fn(() => new Promise<GitHubPullRequestStatus>(() => {}))
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("/repo", "feature", github)
  branches = new Map([["/repo", "feature"]])
  const rows = [row("a")]
  function Harness() {
    const { rows: projected, setVisibleRows } = useMissionControlPullRequests(rows)
    React.useEffect(() => setVisibleRows(rows), [setVisibleRows])
    const pr = projected[0].pullRequest
    return <span>{pr?.number}:{String(pr?.stale)}</span>
  }
  const { container } = render(<Harness />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
    useGitHubPrStatusStore.getState().updateStatus("/repo", () => ({
      ...status, pr: { ...status.pr!, number: 88 },
    }), Date.now())
    await vi.advanceTimersByTimeAsync(19_000)
  })
  expect(container.textContent).toBe("88:false")
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
    useGitHubPrStatusStore
      .getState()
      .updateStatus("/repo", () => ({ ...status, pr: { ...status.pr!, number: 99 } }), Date.now())
    finish(status)
    await Promise.resolve()
  })
  expect(useGitHubPrStatusStore.getState().entries["/repo"].status?.pr?.number).toBe(99)
  expect(container.textContent).toBe("99")
})

test("a former remote's board read cannot replace the newly preferred remote", async () => {
  let finish!: (value: GitHubPullRequestStatus) => void
  const fetch = vi.fn(() => new Promise<GitHubPullRequestStatus>((resolve) => { finish = resolve }))
  const github = { prStatus: fetch } as unknown as GitHubAPI
  known("/repo", "feature", github, "origin")
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
  expect(fetch).toHaveBeenCalledWith("/repo", "feature", "origin", { signal: expect.any(AbortSignal) })
  await act(async () => {
    known("/repo", "feature", github, "upstream", "upstream")
    useGitHubPrStatusStore.getState().updateStatus("upstream", () => ({
      ...status, pr: { ...status.pr!, number: 88 },
    }), Date.now())
  })
  expect(container.textContent).toBe("88")
  await act(async () => {
    vi.setSystemTime(100_100)
    finish({ ...status, pr: { ...status.pr!, number: 99 } })
  })
  expect(container.textContent).toBe("88")
  expect(useGitHubPrStatusStore.getState().entries.origin.status?.pr?.number).toBe(42)
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

test("the known pull request for a branch starts no read and ages into stale", () => {
  const fetch = vi.fn()
  known("/repo", "feature", { prStatus: fetch } as unknown as GitHubAPI)
  // The seed records no refresh time; a status that was never refreshed is stale from the start.
  useGitHubPrStatusStore.getState().updateStatus("/repo", (previous) => previous, Date.now())
  const seen: Array<ReturnType<typeof useKnownPullRequest>> = []
  const Probe = ({ branch }: { branch: string | null }) => {
    seen.push(useKnownPullRequest("/repo", branch))
    return null
  }
  const view = render(<Probe branch="feature" />)
  expect(seen.at(-1)).toMatchObject({ number: 42, state: "open", checks: "pending", stale: false })
  // A branch nothing was read for, or an unknown branch, has no pull request to quote.
  view.rerender(<Probe branch="other" />)
  expect(seen.at(-1)).toBeNull()
  view.rerender(<Probe branch={null} />)
  expect(seen.at(-1)).toBeNull()
  view.rerender(<Probe branch="feature" />)
  act(() => {
    vi.advanceTimersByTime(120_000)
  })
  expect(seen.at(-1)).toMatchObject({ number: 42, stale: true })
  expect(fetch).not.toHaveBeenCalled()
})

test("a known pull request is stale when its refresh time is in the future, and absent on a detached HEAD", () => {
  known("/repo", "feature", { prStatus: vi.fn() } as unknown as GitHubAPI)
  // The clock stepped back after the refresh: the age cannot be trusted.
  useGitHubPrStatusStore.getState().updateStatus("/repo", (previous) => previous, Date.now() + 60_000)
  const seen: Array<ReturnType<typeof useKnownPullRequest>> = []
  const Probe = ({ branch }: { branch: string }) => {
    seen.push(useKnownPullRequest("/repo", branch))
    return null
  }
  const view = render(<Probe branch="feature" />)
  expect(seen.at(-1)).toMatchObject({ number: 42, stale: true })
  view.rerender(<Probe branch="HEAD" />)
  expect(seen.at(-1)).toBeNull()
})

test("a branch with pull requests on two remotes quotes the one it tracks", () => {
  const github = { prStatus: vi.fn() } as unknown as GitHubAPI
  known("/repo", "feature", github, "origin-key", "origin")
  known("/repo", "feature", github, "fork-key", "upstream")
  const store = useGitHubPrStatusStore.getState()
  store.updateStatus("origin-key", (previous) => previous && { ...previous, pr: { ...previous.pr!, number: 10 } }, 99_000)
  // The fork's status is the newer one, which is what an unscoped lookup prefers.
  store.updateStatus("fork-key", (previous) => previous && { ...previous, pr: { ...previous.pr!, number: 20 } }, 100_000)
  const seen: Array<number | undefined> = []
  const Probe = ({ remote }: { remote: string | null }) => {
    seen.push(useKnownPullRequest("/repo", "feature", remote)?.number)
    return null
  }
  const view = render(<Probe remote="origin" />)
  expect(seen.at(-1)).toBe(10)
  view.rerender(<Probe remote={null} />)
  expect(seen.at(-1)).toBe(20)
  view.rerender(<Probe remote="elsewhere" />)
  expect(seen.at(-1)).toBeUndefined()
})
