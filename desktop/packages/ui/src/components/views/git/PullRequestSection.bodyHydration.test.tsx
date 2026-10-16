import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import type { GitHubPullRequestStatus } from "@/lib/api/types"

const { prContext } = vi.hoisted(() => ({
  prContext: vi.fn(),
}))

// A stable object: the section puts `github` in its effect dependencies, so a fresh one per render
// re-registers the status watcher on every render.
const runtimeAPIs = {
  github: {
    prContext: (...args: unknown[]) => prContext(...args),
    prStatus: vi.fn(async () => null),
    prChecks: vi.fn(async () => null),
  },
}

vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => runtimeAPIs }))
vi.mock("@/hooks/useDeviceInfo", () => ({ useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }) }))

const { getGitHubPrStatusKey, useGitHubPrStatusStore } = await import("@/stores/useGitHubPrStatusStore")
const { useGitHubAuthStore } = await import("@/stores/useGitHubAuthStore")
const { PullRequestSection } = await import("./PullRequestSection")

const DIRECTORY = "/repo"
const BRANCH = "feature"
const PR_NUMBER = 7

const status = (body: string): GitHubPullRequestStatus => ({
  connected: true,
  resolvedRemoteName: "origin",
  pr: {
    number: PR_NUMBER,
    state: "open",
    draft: false,
    title: "The pull request",
    body,
    url: `https://github.com/example/repo/pull/${PR_NUMBER}`,
    base: "main",
    head: BRANCH,
    mergeable: true,
    mergeableState: "clean",
  },
  checks: { state: "success", total: 1, success: 1, failure: 0, pending: 0 },
  canMerge: true,
  repo: { owner: "example", repo: "repo", url: "https://github.com/example/repo" },
})

describe("PullRequestSection body hydration", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    prContext.mockReset()
    useGitHubAuthStore.setState({ status: { connected: true }, hasChecked: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderSection = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <PullRequestSection directory={DIRECTORY} branch={BRANCH} baseBranch="main" />
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  // The section re-reads the entry when the window is refocused, so a refresh that just happened must
  // not latch the answer: `shouldRefresh` used to be computed once per effect run and captured.
  const renderWithRefreshSpy = async () => {
    const refreshSpy = vi.spyOn(useGitHubPrStatusStore.getState(), "refresh")
    const key = getGitHubPrStatusKey(DIRECTORY, BRANCH, null)
    const now = Date.now()
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    try {
      useGitHubPrStatusStore.setState({
        entries: {
          [key]: {
            status: status("A description"),
            isLoading: false,
            error: null,
            isInitialStatusResolved: true,
            lastRefreshAt: now,
            lastDiscoveryPollAt: 0,
            watchers: 1,
            params: null,
            identity: null,
            resolvedRemoteName: null,
          },
        },
      })

      await renderSection()
      // Rendering arms the status watcher, which refreshes on its own; only the calls after this
      // point belong to the refocus.
      const baseline = refreshSpy.mock.calls.length

      nowSpy.mockReturnValue(now + 61_000)
      await act(async () => {
        window.dispatchEvent(new Event("focus"))
      })

      return { refreshSpy, baseline, key }
    } finally {
      nowSpy.mockRestore()
    }
  }

  test("refreshes on refocus once the entry is stale", async () => {
    const { refreshSpy, baseline, key } = await renderWithRefreshSpy()

    expect(refreshSpy.mock.calls.slice(baseline)).toEqual([[key, { force: true, silent: true }]])
  })

  const showsLoadingDescription = () =>
    container.textContent?.includes(dict["gitView.pr.loadingDescription"]) ?? false

  // A pull request with no description is the reachable case: the hydration request answers with an
  // empty body, the store still writes a fresh entry (so this section re-renders while the fetching
  // effect's `.then` is on the stack), React runs the effect cleanup before the chain's `.finally`
  // continues, and the cleanup cancels the attempt. Clearing the flag only in `.finally` left the
  // loading line where "No description" belongs, for good.
  test("shows the no-description line when the pull request has no body", async () => {
    prContext.mockResolvedValue({ pr: { number: PR_NUMBER, body: "" } })
    // No remotes are passed, so the section keys its status entry on the branch alone.
    const key = getGitHubPrStatusKey(DIRECTORY, BRANCH, null)
    useGitHubPrStatusStore.setState({
      entries: {
        [key]: {
          status: status(""),
          isLoading: false,
          error: null,
          isInitialStatusResolved: true,
          lastRefreshAt: 0,
          lastDiscoveryPollAt: 0,
          watchers: 0,
          params: null,
          identity: null,
          resolvedRemoteName: null,
        },
      },
    })

    await renderSection()
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {})

    expect(prContext).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain(dict["gitView.pr.noDescription"])
    expect(showsLoadingDescription()).toBe(false)
  })
})
