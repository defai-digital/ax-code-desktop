**1. HIGH — Commit ignores the reviewed staged set** `desktop/packages/ui/src/components/views/git/landingActions.ts:28`
`commitChanges` always sends `stageFiles: []`; the server treats any array (even empty) as “commit the index only” (`desktop/packages/web/server/lib/git/service.js:3589-3590, 3624-3631`), so `files` is only a presence check and `git.commit(message)` commits the whole live index. Failure: a file staged after the last status refresh (terminal `git add`, a concurrent agent editing the same worktree, a pre-commit hook) is committed although ReviewLanding’s “Commit N staged files” list never showed it. Fix: re-read `getGitStatus` immediately before committing, compare its staged path set with `stagedPaths`, abort/refresh on mismatch; or make index-only commits take the path list.

**2. MEDIUM — “Stage reviewed” silently becomes “Stage all”** `ReviewLanding.tsx:41-44`
`toStage = reviewed.length ? reviewed : unstaged`. Any change that invalidates marks (staging a hunk in the diff view, an agent rewriting a file) empties `reviewed`, and the same button then stages every remaining file, most never viewed. Fix: never widen automatically; make “Stage all” a separate, confirmed action and state why marks were cleared.

**3. MEDIUM — Reviewed set is stale when applied** `ReviewLanding.tsx:96-112`
`git add` acts on the live worktree while `toStage` comes from the cached status; `run()` never refetches. A write between the last status fetch and the click is staged as “reviewed”. Fix: `store.fetchStatus(...)` first, recompute signatures, abort if any differ.

**4. LOW — Count-only signatures treated as proof** `stores/useReviewProgressStore.ts:103`
When blob ids are absent (large files, files past the status cap) the signature falls back to counts/status, so a same-count rewrite keeps its mark and is staged. Fix: refuse silent staging of fallback-signed rows (the rail already flags them).

**5. MEDIUM — Git panel push is unpinned** `GitView-impl.tsx:1150` → `landingActions.ts:56-61`
`handleRemoteAction` passes no `expected`, so `pushChanges` runs `gitPush(directory, { remote })` without a refspec. For a differently-named upstream (`topic` → `origin/release/topic`) `push.default=simple` refuses, and if the branch changes between render and click the newly checked-out branch is pushed instead of the displayed one. The review flow pins `current:upstream`; the panel should pass `expected: status` too.

No defect found in the double-submit guard (`busy` ref plus pending/disabled state), commit-message retention on failure, or Windows paths (paths come from git status; the header splits both separators).

Reviewed the current on-disk contents; `git diff` was unavailable because no shell tool is enabled in this session.