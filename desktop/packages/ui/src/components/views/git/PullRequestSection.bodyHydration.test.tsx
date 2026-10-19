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

const status = (body: string, title = "The pull request"): GitHubPullRequestStatus => ({
  connected: true,
  resolvedRemoteName: "origin",
  pr: {
    number: PR_NUMBER,
    state: "open",
    draft: false,
    title,
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

const statusEntry = (directory: string, body: string, title?: string) => ({
  key: getGitHubPrStatusKey(directory, BRANCH, null),
  entry: {
    status: status(body, title),
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
})

const seedStatuses = (...statuses: ReturnType<typeof statusEntry>[]) => {
  useGitHubPrStatusStore.setState({
    entries: Object.fromEntries(statuses.map(({ key, entry }) => [key, entry])),
  })
}

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

  const renderSection = async (directory = DIRECTORY) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <PullRequestSection directory={directory} branch={BRANCH} baseBranch="main" />
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

  const setInputValue = (input: HTMLInputElement, value: string) => {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  const editTitleInput = () =>
    container.querySelector<HTMLInputElement>(`input[placeholder="${dict["gitView.pr.placeholder.title"]}"]`)

  // Two repositories can each have an open PR with the same number. The section stays mounted
  // across the switch, so the draft used to survive and saving wrote repo A's text into repo B.
  test("does not carry the edit draft into another repository's same-numbered PR", async () => {
    const otherDirectory = "/other-repo"
    seedStatuses(
      statusEntry(DIRECTORY, "Body A", "Title A"),
      statusEntry(otherDirectory, "Body B", "Title B"),
    )

    await renderSection()
    const editButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${dict["gitView.pr.actions.editPrAria"]}"]`,
    )
    expect(editButton).not.toBeNull()
    act(() => editButton?.click())

    const titleInput = editTitleInput()
    expect(titleInput).not.toBeNull()
    setInputValue(titleInput!, "Draft from repo A")

    await renderSection(otherDirectory)

    expect(container.textContent).toContain("Title B")
    expect(editTitleInput()).toBeNull()
  })

  test("closes the comments dialog and ignores a late response when the directory changes", async () => {
    const otherDirectory = "/other-repo"
    seedStatuses(
      statusEntry(DIRECTORY, "Body A"),
      statusEntry(otherDirectory, "Body B"),
    )

    let resolveComments: (value: unknown) => void = () => {}
    prContext.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveComments = resolve
      }),
    )

    await renderSection()
    const commentsButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${dict["gitView.pr.actions.openCommentsAria"]}"]`,
    )
    expect(commentsButton).not.toBeNull()
    act(() => commentsButton?.click())
    await act(async () => {})
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull()

    await renderSection(otherDirectory)

    // The dialog belonged to repo A; it must not sit under repo B's header.
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()

    // A response that started before the switch must not populate the dialog afterwards.
    await act(async () => {
      resolveComments({
        issueComments: [{ id: 1, body: "Comment from repo A", author: { login: "alice" } }],
      })
    })
    await act(async () => {})

    expect(document.body.textContent).not.toContain("Comment from repo A")
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
  })

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
