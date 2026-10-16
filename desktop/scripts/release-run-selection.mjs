import { pathToFileURL } from "node:url"

/**
 * Picks the GitHub Actions run that will publish a release tag.
 *
 * Called from desktop/scripts/publish-github-release.sh right after the tag is pushed. The run
 * for the tag has `headBranch === tag`, which is the only signal that a run cannot have come
 * from an earlier push on the same commit — a run from the push that *put* that commit there is
 * otherwise indistinguishable, and watching the finished one returned immediately while the
 * tag's own build was still going.
 *
 * A same-commit run is therefore only a fallback, used when no tag run is listed yet (a
 * `workflow_dispatch` carries the branch name, not the tag), and it must have started after the
 * tag push. Exports nothing else and prints a bare databaseId when run as a command; empty
 * output means "no run yet" and the caller keeps polling.
 */
function startedAfterPush(createdAt, pushedAt) {
  const created = Date.parse(createdAt)
  const pushed = Date.parse(pushedAt)
  if (!Number.isFinite(created) || !Number.isFinite(pushed)) return false
  return created > pushed
}

function newest(candidates) {
  return candidates.reduce((best, run) => {
    const runAt = Date.parse(run.createdAt)
    const bestAt = Date.parse(best.createdAt)
    if (!Number.isFinite(bestAt)) return run
    if (!Number.isFinite(runAt)) return best
    return runAt > bestAt ? run : best
  })
}

export function selectReleaseRun(runs, { tag, headSha, pushedAt } = {}) {
  const candidates = (Array.isArray(runs) ? runs : []).filter(
    (run) => run && typeof run === "object" && run.databaseId !== undefined && run.databaseId !== null,
  )

  const forTag = candidates.filter((run) => run.headBranch === tag)
  if (forTag.length > 0) return newest(forTag)

  const afterPush = candidates.filter(
    (run) => run.headSha === headSha && startedAfterPush(run.createdAt, pushedAt),
  )
  return afterPush.length > 0 ? newest(afterPush) : null
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
