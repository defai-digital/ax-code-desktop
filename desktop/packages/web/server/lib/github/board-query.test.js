import { describe, expect, it } from "vitest"
import {
  buildIssueSearchQuery,
  buildPullSearchQuery,
  classifyPullState,
  mapIssueListItem,
  mapPullListItem,
  normalizeIssueListState,
  normalizePullListState,
  sanitizeGitHubSearchText,
} from "./board-query.js"

describe("github board query", () => {
  it("defaults missing list states to open", () => {
    expect(normalizeIssueListState(undefined)).toBe("open")
    expect(normalizeIssueListState("closed")).toBe("closed")
    expect(normalizeIssueListState("merged")).toBe("open")
    expect(normalizePullListState("merged")).toBe("merged")
    expect(normalizePullListState("closed")).toBe("closed")
    expect(normalizePullListState("nope")).toBe("open")
  })

  it("quotes search text so it cannot add a repo qualifier", () => {
    expect(sanitizeGitHubSearchText('repo:evil "drop"')).toBe("repo:evil drop")
    expect(
      buildIssueSearchQuery({
        owner: "acme",
        repo: "app",
        state: "closed",
        label: "good first issue",
        text: "repo:evil",
      }),
    ).toBe('repo:acme/app is:issue is:closed label:"good first issue" "repo:evil"')
  })

  it("matches several labels when the value is comma-separated", () => {
    // The route sends a comma-joined value down this path *because* a comma separates labels on listForRepo, and
    // GitHub's search needs one qualifier per label: a single quoted phrase matched only a label by that name.
    expect(
      buildIssueSearchQuery({ owner: "acme", repo: "app", state: "open", label: "bug,ui", text: "" }),
    ).toBe('repo:acme/app is:issue is:open label:"bug" label:"ui"')
    expect(
      buildIssueSearchQuery({ owner: "acme", repo: "app", state: "open", label: "bug, ui ,", text: "" }),
    ).toBe('repo:acme/app is:issue is:open label:"bug" label:"ui"')
  })

  it("builds a merged pull search that stays inside the repository", () => {
    expect(buildPullSearchQuery({ owner: "acme", repo: "app", state: "merged", text: "fix login" })).toBe(
      'repo:acme/app is:pr is:merged "fix login"',
    )
    expect(buildPullSearchQuery({ owner: "acme", repo: "app", state: "closed", text: "" })).toBe(
      "repo:acme/app is:pr is:closed is:unmerged",
    )
    expect(buildIssueSearchQuery({ owner: "bad name", repo: "app", state: "open", label: "", text: "x" })).toBeNull()
  })

  it("drops pull requests from an issue list and keeps labels", () => {
    expect(mapIssueListItem({ number: 1, title: "PR", pull_request: { url: "x" } }, null)).toBeNull()
    expect(
      mapIssueListItem(
        {
          number: 4,
          title: "Bug",
          html_url: "https://github.com/acme/app/issues/4",
          state: "open",
          updated_at: "2026-01-02T00:00:00Z",
          user: { login: "ada", id: 7, avatar_url: "https://example.test/a.png" },
          labels: [{ name: "bug", color: "d73a4a" }, "skip", { name: "" }],
        },
        { owner: "acme", repo: "app", source: "origin" },
      ),
    ).toMatchObject({
      number: 4,
      state: "open",
      updatedAt: "2026-01-02T00:00:00Z",
      author: { login: "ada" },
      labels: [{ name: "bug", color: "d73a4a" }],
      sourceRepo: { owner: "acme", repo: "app", source: "origin" },
    })
  })

  it("classifies merged and closed pulls", () => {
    expect(classifyPullState({ number: 1, state: "closed", merged_at: "2026-01-01T00:00:00Z" })).toBe("merged")
    expect(classifyPullState({ number: 2, state: "closed", merged_at: null })).toBe("closed")
    expect(classifyPullState({ number: 3, state: "closed", merged: true })).toBe("merged")
    expect(classifyPullState({ number: 4, state: "open" })).toBe("open")
  })

  it("includes a review count only when the list payload already has reviewers", () => {
    const mapped = mapPullListItem(
      {
        number: 9,
        title: "Add board",
        html_url: "https://github.com/acme/app/pull/9",
        state: "open",
        draft: true,
        updated_at: "2026-02-01T00:00:00Z",
        user: { login: "ada", id: 1 },
        labels: [{ name: "ui", color: "ededed" }],
        requested_reviewers: [{ login: "bea" }],
        base: { ref: "main" },
        head: { ref: "board", sha: "abc" },
      },
      { owner: "acme", repo: "app", source: "origin" },
    )
    expect(mapped).toMatchObject({
      state: "open",
      draft: true,
      review: { requested: 1 },
      labels: [{ name: "ui", color: "ededed" }],
      updatedAt: "2026-02-01T00:00:00Z",
    })
    expect(mapPullListItem({ number: 3, title: "x", state: "open" }, null).review).toBeUndefined()
  })
})
