import { afterEach, describe, expect, it, vi } from "vitest"
import { createWebGitHubAPI } from "./github"

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

const fetchMock = vi.fn(async () => jsonResponse({ merged: true, ready: true, number: 7 }))

describe("web github API pull-request repo targeting", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  it("names the pull request's repo on merge, mark-ready and edit", async () => {
    // The route resolves the repo from the directory alone when the caller names none,
    // which acts on the origin repo's pull request with the same number - an unrelated
    // one - while the header shows the upstream PR.
    vi.stubGlobal("fetch", fetchMock)
    const api = createWebGitHubAPI()
    const sourceRepo = { owner: "org", repo: "upstream" }

    await api.prMerge({ directory: "/repo", number: 7, method: "squash", sourceRepo })
    await api.prReady({ directory: "/repo", number: 7, sourceRepo })
    await api.prUpdate({ directory: "/repo", number: 7, title: "t", sourceRepo })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0])
      expect(url).toContain("owner=org")
      expect(url).toContain("repo=upstream")
    }
  })

  it("keeps the endpoint unchanged when the caller names no repo", async () => {
    vi.stubGlobal("fetch", fetchMock)
    const api = createWebGitHubAPI()

    await api.prMerge({ directory: "/repo", number: 7, method: "merge" })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).not.toContain("owner=")
    expect(url).not.toContain("repo=")
  })
})
