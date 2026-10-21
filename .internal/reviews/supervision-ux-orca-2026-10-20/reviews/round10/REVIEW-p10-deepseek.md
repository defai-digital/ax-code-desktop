# Round 10 P10 review (deepseek-flash, read-only)

## Final answer: P10 review

**No blocking issue.** Scope covered every listed file plus the shared `useGitHubPrStatusStore`, `remoteActivityCache` (the pattern being copied), `projectResolution`, `script/check-locales.ts` + `localization-catalog.ts`, and all 14 locale catalogs.
Verified as sound by reading: request demand is capped at two concurrent fetches with every in-flight slot guaranteed to release via the 20 s race; failure backoff (30 s) and freshness (90 s) are enforced per key; 300-entry / 1 000-deadline bounds hold; the `signal.aborted` guard prevents a late timed-out response from writing the shared store; `lastRefreshAt > startedAt` prevents a slow board read from overwriting a newer integration read (and returns that newer projection to the board cache); retry timers are cleared when the last consumer disposes and in-flight fetches cannot re-arm them; `pullRequestKey` normalizes separators and lowercases drive/UNC paths while preserving POSIX case; nothing retains credentials, titles, bodies or raw SDK errors in the board cache; CI state comes only from enumerated `checks.state` with `total > 0`, so prose/mergeability/runtime verification cannot imply it.
Findings, in priority order:
1. **MEDIUM `lib/supervision/missionControl.ts:136-142`** — "Checks failing on PR" lacks a state predicate, so a **merged or closed** PR with `checks: "failed"` matches the facet. Untested (existing test covers only open/draft/merged-without-failure).
2. **MEDIUM `hooks/useMissionControlPullRequests.ts:34`** — `updateStatus` replaces the shared entry's `status` wholesale, discarding the body-carry logic in `useGitHubPrStatusStore.ts:553-571`; a board payload without `pr.body` blanks a body `PullRequestSection` had loaded.
3. **MEDIUM `hooks/useMissionControlPullRequests.ts:109`** — `stale` is computed inside `useMemo` from `Date.now()`, so a snapshot never ages past 90 s until an unrelated re-render; the PR facets can keep counting it.
4. **LOW `hooks/useMissionControlPullRequests.ts:84`** — `identity.branch === branch` compares untrimmed against the trimmed target; a padded `params.branch` silently yields no chip.
5. **LOW** — the 90 000 ms interval is duplicated in `pullRequestCache.ts:58`, `useGitHubPrStatusStore.ts:7` and the hook; drift makes the chip stale while the cache considers it fresh.
6. **LOW** — the report claims other locale catalogs are untouched, but all 13 JSON catalogs already carry `supervision.missionControl.pr.*` (5183-5191) and `shared-spelling.json` allowlists `pr.label`. Harmless for `check:locales`; only the handoff note is inaccurate.
Residual risk: native macOS/Windows/Linux journeys and live GitHub qualification were not run by the author, and no check was executed by me, so items 1-3 are source-level conclusions consistent with a green suite rather than reproduced failures.

## Dispositions

1. Fixed: the "Checks failing on PR" facet now requires an open or draft PR. The facets test adds a merged PR with failed checks; mutation probe killed.
2. Fixed: the board's shared-store write carries a body PullRequestSection already loaded (same rule as the store's own refresh). Hook regression test; mutation probe killed.
3. Fixed: the hook re-projects on a 15 s clock, so a snapshot ages into stale without an unrelated render. Same hook test; mutation probe killed.
4. Fixed: the known-entry branch comparison trims the stored branch (covered by the same test's padded branch).
5. Fixed: `PULL_REQUEST_FRESH_MS` is exported from `pullRequestCache.ts` and used by the cache and the hook. The store keeps its own TTL constant, which it owns.
6. Accepted: only the handoff note was inaccurate; the locale catalogs are correct and `check:locales` passes.
