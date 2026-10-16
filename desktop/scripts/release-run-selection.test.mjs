import { describe, expect, test } from "vitest"
import { spawnSync } from "node:child_process"
import path from "node:path"

import { selectReleaseRun } from "./release-run-selection.mjs"

const TAG = "v1.2.3"
const HEAD_SHA = "aaa1111"
const PUSHED_AT = "2026-10-16T10:00:00Z"

const run = (overrides) => ({
  databaseId: 1,
  headBranch: "main",
  headSha: HEAD_SHA,
  event: "push",
  status: "completed",
  conclusion: "success",
  createdAt: "2026-10-16T09:00:00Z",
  ...overrides,
})

describe("release run selection", () => {
  test("takes the run for the tag, not an earlier run on the same commit", () => {
    const selected = selectReleaseRun(
      [
        // A push on the same commit that ran and finished before the tag existed.
        run({ databaseId: 41, headBranch: "main", createdAt: "2026-10-16T08:00:00Z" }),
        run({ databaseId: 42, headBranch: TAG, event: "push", createdAt: "2026-10-16T10:00:05Z" }),
      ],
      { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT },
    )

    expect(selected?.databaseId).toBe(42)
  })

  test("the tag's own run wins even when a same-commit run started later", () => {
    const selected = selectReleaseRun(
      [
        run({ databaseId: 45, headBranch: "main", createdAt: "2026-10-16T11:00:00Z" }),
        run({ databaseId: 44, headBranch: TAG, createdAt: "2026-10-16T10:00:05Z" }),
      ],
      { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT },
    )

    expect(selected?.databaseId).toBe(44)
  })

  test("ignores a same-commit run that started before the tag was pushed", () => {
    // Matching on headSha alone watched this one: it had already finished, so the script
    // stopped waiting while the tag's own build was still running. A tolerance for clock
    // skew here would readmit the run from the push that created the commit.
    const selected = selectReleaseRun(
      [run({ databaseId: 41, headBranch: "main", createdAt: "2026-10-16T09:59:00Z" })],
      { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT },
    )

    expect(selected).toBeNull()
  })

  test("falls back to a same-commit run that started with the tag push", () => {
    const selected = selectReleaseRun(
      [run({ databaseId: 43, headBranch: "main", event: "workflow_dispatch", createdAt: "2026-10-16T10:00:30Z" })],
      { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT },
    )

    expect(selected?.databaseId).toBe(43)
  })

  test("prefers the newest candidate", () => {
    const selected = selectReleaseRun(
      [
        run({ databaseId: 44, headBranch: TAG, createdAt: "2026-10-16T10:00:05Z" }),
        run({ databaseId: 45, headBranch: TAG, createdAt: "2026-10-16T10:02:05Z" }),
      ],
      { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT },
    )

    expect(selected?.databaseId).toBe(45)
  })

  test("reports no run while the workflow has not started", () => {
    expect(selectReleaseRun([], { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT })).toBeNull()
    expect(selectReleaseRun(undefined, { tag: TAG, headSha: HEAD_SHA, pushedAt: PUSHED_AT })).toBeNull()
  })

  test("prints the chosen databaseId and nothing when there is no run", () => {
    const script = path.resolve(import.meta.dirname, "release-run-selection.mjs")
    const baseEnv = { ...process.env, TAG, HEAD_SHA, PUSHED_AT }

    const found = spawnSync("node", [script], {
      encoding: "utf8",
      env: {
        ...baseEnv,
        RUNS_JSON: JSON.stringify([run({ databaseId: 46, headBranch: TAG, createdAt: "2026-10-16T10:00:05Z" })]),
      },
    })
    expect(found.status).toBe(0)
    expect(found.stdout.trim()).toBe("46")

    const notFound = spawnSync("node", [script], {
      encoding: "utf8",
      env: { ...baseEnv, RUNS_JSON: JSON.stringify([run({ databaseId: 47, createdAt: "2026-10-16T08:00:00Z" })]) },
    })
    expect(notFound.status).toBe(0)
    expect(notFound.stdout.trim()).toBe("")
  })
})
