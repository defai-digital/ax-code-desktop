import { afterEach, describe, expect, it, vi } from "vitest"
import { createWebGitHubAPI } from "./github"

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

const fetchMock = vi.fn(async () => jsonResponse({ merged: true, ready: true, number: 7 }))

const requestedUrls = (): string[] =>
  (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).map((call) => String(call[0]))

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

    const urls = requestedUrls()
    expect(urls).toHaveLength(3)
    for (const url of urls) {
      expect(url).toContain("owner=org")
      expect(url).toContain("repo=upstream")
    }
  })

  it("keeps the endpoint unchanged when the caller names no repo", async () => {
    vi.stubGlobal("fetch", fetchMock)
    const api = createWebGitHubAPI()

    await api.prMerge({ directory: "/repo", number: 7, method: "merge" })

    const [url] = requestedUrls()
    expect(url).not.toContain("owner=")
    expect(url).not.toContain("repo=")
  })
})

describe("web github API issue board requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  it("sends state, label and search text on the issue list", async () => {
    vi.stubGlobal("fetch", fetchMock)
    const api = createWebGitHubAPI()

    await api.issuesList("/repo", { page: 2, state: "closed", label: "bug", q: "login crash" })

    const [url] = requestedUrls()
    expect(url).toContain("/api/github/issues/list?")
    expect(url).toContain("directory=%2Frepo")
    expect(url).toContain("page=2")
    expect(url).toContain("state=closed")
    expect(url).toContain("label=bug")
    expect(url).toContain("q=login+crash")
  })

  it("posts a comment and a state change against the named repo", async () => {
    vi.stubGlobal("fetch", fetchMock)
    const api = createWebGitHubAPI()
    const sourceRepo = { owner: "org", repo: "upstream" }

    await api.issueComment({ directory: "/repo", number: 4, body: "Looks good", sourceRepo })
    await api.issueSetState({ directory: "/repo", number: 4, state: "closed", sourceRepo })

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>
    expect(String(calls[0]?.[0])).toContain("/api/github/issues/comments?")
    expect(String(calls[0]?.[0])).toContain("owner=org")
    expect(String(calls[0]?.[0])).toContain("repo=upstream")
    expect(calls[0]?.[1]?.method).toBe("POST")
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ directory: "/repo", number: 4, body: "Looks good" })

    expect(String(calls[1]?.[0])).toContain("/api/github/issues/state?")
    expect(calls[1]?.[1]?.method).toBe("POST")
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({ directory: "/repo", number: 4, state: "closed" })
  })

  it("omits owner and repo when the comment names no source repo", async () => {
    vi.stubGlobal("fetch", fetchMock)
    const api = createWebGitHubAPI()

    await api.issueComment({ directory: "/repo", number: 4, body: "Looks good" })

    const [url] = requestedUrls()
    expect(url).toBe("/api/github/issues/comments")
    expect(url).not.toContain("owner=")
  })
})
