import { describe, expect, it } from "vitest"

import { buildIssueWorkContext, buildPullRequestWorkContext } from "./githubWorkSession"

describe("github work session context", () => {
  it("matches the issue picker context payload", () => {
    const text = buildIssueWorkContext({
      repo: { owner: "acme", repo: "app", url: "https://github.com/acme/app" },
      issue: {
        number: 4,
        title: "Bug",
        url: "https://github.com/acme/app/issues/4",
        state: "open",
        body: "steps",
      },
      comments: [],
    })
    expect(text.startsWith("GitHub issue context (JSON)\n")).toBe(true)
    expect(JSON.parse(text.slice("GitHub issue context (JSON)\n".length))).toMatchObject({
      repo: { owner: "acme", repo: "app" },
      issue: { number: 4, body: "steps" },
      comments: [],
    })
  })

  it("matches the pull request picker context payload", () => {
    const text = buildPullRequestWorkContext({
      connected: true,
      pr: {
        number: 9,
        title: "Board",
        url: "https://github.com/acme/app/pull/9",
        state: "open",
        draft: false,
        base: "main",
        head: "board",
      },
    })
    expect(text.startsWith("GitHub pull request context (JSON)\n")).toBe(true)
    expect(JSON.parse(text.slice("GitHub pull request context (JSON)\n".length)).pr.number).toBe(9)
  })
})
