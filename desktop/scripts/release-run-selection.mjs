import { pathToFileURL } from "node:url"

/**
 * Picks the GitHub Actions run that will publish a release tag.
 *
 * Called from desktop/scripts/publish-github-release.sh right after the tag is pushed.
 * The run for the tag has `headBranch === tag`. A `workflow_dispatch` run for the same
 * commit carries the branch name instead, so a same-commit run is accepted only when it
 * started at or after the tag push: matching on `headSha` alone picked up a run from an
 * earlier push on that commit, and `gh run watch` returned the moment that finished run
 * did while the tag's own build was still going.
 *
 * Exports nothing else and prints a bare databaseId when run as a command; empty output
 * means "no run yet" and the caller keeps polling.
 */

/** GitHub reports `createdAt` in UTC; the local clock can sit slightly behind it. */
const CLOCK_SKEW_MS = 120_000

function createdAfterPush(createdAt, pushedAt) {
  const created = Date.parse(createdAt)
  const pushed = Date.parse(pushedAt)
  if (!Number.isFinite(created) || !Number.isFinite(pushed)) return false
  return created >= pushed - CLOCK_SKEW_MS
}

export function selectReleaseRun(runs, { tag, headSha, pushedAt } = {}) {
  const candidates = (Array.isArray(runs) ? runs : []).filter((run) => {
    if (!run || typeof run !== "object" || run.databaseId === undefined || run.databaseId === null) return false
    if (run.headBranch === tag) return true
    return run.headSha === headSha && createdAfterPush(run.createdAt, pushedAt)
  })

  if (candidates.length === 0) return null

  return candidates.reduce((newest, run) => {
    const runAt = Date.parse(run.createdAt)
    const newestAt = Date.parse(newest.createdAt)
    if (!Number.isFinite(newestAt)) return run
    if (!Number.isFinite(runAt)) return newest
    return runAt > newestAt ? run : newest
  })
}

function main() {
  let runs = []
  try {
    runs = JSON.parse(process.env.RUNS_JSON || "[]")
  } catch {
    console.error("release-run-selection: RUNS_JSON is not valid JSON")
    process.exit(2)
  }

  const run = selectReleaseRun(runs, {
    tag: process.env.TAG,
    headSha: process.env.HEAD_SHA,
    pushedAt: process.env.PUSHED_AT,
  })

  if (run) {
    process.stdout.write(`${run.databaseId}\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
