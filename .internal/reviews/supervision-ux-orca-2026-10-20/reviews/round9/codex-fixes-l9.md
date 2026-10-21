# Round 9 L9 review fixes

All four findings are fixed in the current working tree. No commit was made. Existing round-9 edits were retained; the initial SHA-256 inventory confirms changes only in the seven allowed source/test files, with no new repository files. No locale strings were added (`i18n-additions-l9fix.json` is `[]`).

| Finding | Change | Regression coverage | Mutation probe |
| --- | --- | --- | --- |
| 1. Cached preflight | Added `bypassCache` to the Git API contract and HTTP implementation. Only stage/commit preflights opt in. Each bypass starts an independent HTTP `no-store` request without reading/writing the TTL cache or joining/registering an in-flight slot; ordinary caching/deduplication remains intact. | HTTP tests cover warm caches and pending ordinary requests in full/light modes. Landing tests simulate an external HEAD change hidden from ordinary reads and refuse both writes. | Disabling the HTTP bypass fails 4 tests. Removing the stage or commit flag independently fails its regression (1 each). Logs: `1-cache-bypass.log`, `1-stage-preflight.log`, `1-commit-preflight.log`. |
| 2. Unbounded HEAD/fallback reads | HEAD uses `runGitCommand` with the existing 10,000 ms content-identity timeout, including light mode. The first status stream supplies the unborn marker; there is no second status command. Only its bounded first header record is retained. | Full/light tests inspect actual process timeout options and assert exactly one status invocation. Failed/timed-out HEAD reads on a committed branch remain unknown. | Removing the HEAD timeout fails both mode tests. Log: `2-head-timeout.log`. |
| 3. Stranded composer | Leaving the commit action closes the composer and clears its comparison snapshot while preserving message state. Returning to commit reopens/focuses the saved draft with the new index snapshot. | Parameterized stage/push/idle transitions verify closure, retained text, focus, and a successful subsequent commit against the changed index. | Disabling the close effect fails all 3 transitions. Log: `3-composer.log`. |
| 4. Older Git unborn HEAD | Detects explicit porcelain-v1 `No commits yet on` and `Initial commit on` headers from the status already read. No porcelain-v2 dependency or blanket interpretation of HEAD errors as unborn remains. | POSIX Git shims reject porcelain v2, emit each historical header, and verify an indexed first file can be committed and produces a real HEAD. Existing UI tests allow known unborn HEAD and reject unknown HEAD. | Disabling unborn detection fails both historical-header regressions. Log: `4-legacy-unborn.log`. |

## Final verification

- `pnpm --dir desktop/packages/ui run type-check`: PASS (exit 0).
- `pnpm --dir desktop/packages/ui run test src/components/views/git/ReviewLanding.test.tsx src/lib/gitApiHttp.test.ts`: PASS, 2 files / 42 tests.
- `pnpm --dir desktop/packages/web exec vitest run server/lib/git`: exit 1, 9 files passed / 1 failed; 212 tests passed / 17 failed. Vitest's substring filter also selects `server/lib/github`. All failures are in the unchanged `server/lib/github/routes.test.js`, with `listen EPERM: operation not permitted 127.0.0.1` under the execution sandbox. All selected Git tests, including the 141-test service suite, pass. The six new service regression cases also passed in a focused run.
- Six mutation probes: all detected by the expected regression assertions (exit 1); every source mutation restored before final validation. Details: `mutation-results-l9fix.json` and the logs above.
- `git diff --check`: PASS.
- Scope: `scope-check-l9fix.json`; reviewable incremental patch against the initial dirty tree: `changes-l9fix.patch`.

Final command logs: `typecheck-l9fix.log`, `ui-tests-l9fix.log`, `web-tests-l9fix.log`. The existing initial `git.status` call and unrelated Git reads are outside this scoped timeout fix. Preflight remains a read-before-write guard, not an atomic lock against a writer changing the repository after the read.
