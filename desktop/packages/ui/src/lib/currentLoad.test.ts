import { describe, expect, test, vi } from "vitest"

import { loadCurrent } from "./currentLoad"

const payloads: [string, unknown][] = [
  [
    "issue list",
    {
      connected: true,
      issues: [{ number: 7, title: "Fix project picker", url: "https://github.com/acme/repo/issues/7", state: "open" }],
      page: 1,
      hasMore: false,
    },
  ],
  [
    "pull request list",
    {
      connected: true,
      prs: [
        {
          number: 1,
          title: "Fix login",
          url: "https://github.com/acme/repo/pull/1",
          head: "fix-login",
          base: "main",
          state: "open",
          draft: false,
        },
      ],
      page: 1,
      hasMore: false,
    },
  ],
  ["issue detail", { issueNumber: 7, comments: [] }],
  ["attach payload", { prNumber: 12, instructionsText: "Review this PR" }],
  ["task list", [{ id: "task-1", title: "Daily summary" }]],
]

describe("loadCurrent", () => {
  test.each(payloads)("returns the loaded %s payload for the current request", async (_label, payload) => {
    await expect(
      loadCurrent({
        load: vi.fn(async () => payload),
        isCurrent: () => true,
      }),
    ).resolves.toEqual({ status: "loaded", result: payload })
  })

  test("returns current request errors", async () => {
    const error = new Error("load failed")

    await expect(
      loadCurrent({
        load: vi.fn(async () => {
          throw error
        }),
        isCurrent: () => true,
      }),
    ).resolves.toEqual({ status: "failed", error })
  })

  test.each(payloads)("suppresses stale %s payloads", async (_label, payload) => {
    await expect(
      loadCurrent({
        load: vi.fn(async () => payload),
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ status: "stale" })
  })

  test("suppresses errors from stale requests", async () => {
    const error = new Error("project changed")

    await expect(
      loadCurrent({
        load: vi.fn(async () => {
          throw error
        }),
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ status: "stale" })
  })
})
