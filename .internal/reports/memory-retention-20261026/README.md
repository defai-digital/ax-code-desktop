# Desktop memory retention investigation — 2026-10-26

This is the initial audit at `48055c8d`. Implementation and subsequent verification are recorded in
[implementation-results.md](implementation-results.md).

## Verdict and scope

Confirmed: current Desktop source contains unbounded application-level retention paths that can increase renderer memory as sessions/projects accumulate. This is sufficient to substantiate a memory-management defect, but not to attribute a particular user's RSS increase to one path or to claim every historical GUI release leaks.

Inspected checkout: `48055c8d` (package version `7.30.1`). Local release tag `v7.30.1` resolves to `3942df727dbd9f22ccec7ba96f8058672cc1c51f`. The four source files implicated below have no differences between that tag and inspected HEAD. Tag/checkout comparison is source evidence, not fresh installed-binary verification.

No AX Code Desktop process was running on this host during inspection. No packaged Electron soak, heap snapshot, forced-GC comparison, native/GPU allocation profile, or user's reproduction was available. No measured MB/hour, total leak size, historical-version attribution, or improvement percentage is claimed. The user specified the latest version and reported a suspicion about all GUI versions, without a workload, OS, or growth figures.

## Reproduced findings

### 1. High priority: live-event message caches escape the session LRU

`desktop/packages/ui/src/sync/event-reducer.ts:614` inserts every `message.updated` into `State.message`; `:661` retains associated parts in `State.part`. `trimSessions` at `:906` bounds the session metadata list without dropping corresponding message/part caches. `session.status` becoming idle does not evict content.

The 40-session cache policy exists in `sync/types.ts` and `use-sync.ts:246`, but runs when `useSync` touches a fetched/paginated session. Incoming background events use `handleEvent` in `sync-context-impl.tsx`, which publishes reducer state without registering these sessions in that seen-session LRU. Session materialization merges snapshots and does not supply a shared content-budget eviction pass. A pinned/actively used directory can therefore keep accumulating completed background sessions despite bounded metadata and directory-store counts.

Behavioral reproduction through the production draft/reducer functions: send lifecycle, completed assistant message, 8,192-character text part, and idle status events for 200 distinct sessions in one directory, without loading them through `useSync`.

Observed assertions:

- Listed session metadata: 5 (fixture's normal `INITIAL_STATE.limit`).
- Cached message sessions: 200, versus `SESSION_CACHE_LIMIT = 40`.
- Part-bearing messages: 200.
- Protected sessions (busy, incomplete assistant, permission or question): 0.
- Retained text content: 1,638,400 characters in the fixtures; this is logical content, not measured heap bytes.

This is unnecessary retention after work completes. It does not require DOM nodes to remain mounted. Explicit archive/delete, directory eviction, or reload may release it; it need not grow during idle time with no new work.

### 2. Medium priority: Git directory state has no directory budget

`desktop/packages/ui/src/stores/useGitStore.ts:385` creates entries in a module-lived Zustand `directories` Map on project changes. Switching clears eligible diff caches, but retains status, logs, branches and other directory state. There is no directory-count/byte/idle eviction or directory-removal action in this store. Its lifecycle is independent of `ChildStoreManager`'s 30-directory policy.

Behavioral reproduction: call `setActiveDirectory` for 100 distinct paths. Observed: `directories.size === 100`. The fixture uses empty directory state, proving the ownership/retention issue rather than its production payload size. Status/log fetch paths write potentially larger data into these entries; their real contribution is unmeasured.

### 3. Medium priority: snippets TTL expires freshness, not retained payloads

`desktop/packages/ui/src/stores/useSnippetsStore.ts:43` holds snapshots/timestamps in module-level Maps. Successful loads at `:99` write directly without the bounded config-cache helper used by commands/MCP configuration. The five-second TTL at `:80` controls refetch only; it does not remove snapshots for other directories. Mutation invalidation affects a specific key and does not provide a global retention bound.

Behavioral reproduction: load snippets for 50 different directories; advance the clock by 60 seconds; revisit each while holding its refetch unresolved. All 50 old, directory-specific payloads remain synchronously available through the store's stale-while-revalidate publication. This demonstrates retained expired snapshots without reading source text or private Maps. It does not imply stale-while-revalidate itself should be removed; retain that behavior within a bounded cache.

### 4. Capacity concern, separate from a confirmed leak

A second reducer probe sends 1,000 completed messages to one session. All 1,000 remain in its message array. Session-count caps alone do not bound a single long conversation, large tool output, or loaded history. Some history retention is intentional; a byte/window budget is needed to determine and constrain acceptable working-set growth. This result alone is not proof of a leak.

## Controls already present

Inspection found file-content entry/size limits, a directory-store count/idle policy with protected-state exceptions, bounded Markdown worker pending jobs/retained request text, and count/size-limited server SSE replay. Existing Git diff pruning also reduces inactive-project payloads. These controls should be preserved, but do not cover the three paths above. Count or string-size limits are not a measured bound on total process memory.

## Recommended implementation order

1. **Unify session-content eviction across all writers.** Track live-event and snapshot/fetch insertions in one directory/session retention policy; run eviction after batches and on busy-to-idle transitions, and sweep idle content periodically. Bound retained inactive sessions and estimated bytes. Preserve the viewed conversation, in-flight sends, active runs, permissions/questions and recovery invariants. Avoid a full-cache scan on every streaming delta. Evict messages, parts, display snapshots, pagination/prefetch metadata and routing ownership consistently; reload old history from the canonical runtime when needed.
2. **Bound directory/config snapshots.** Add Git directory count/byte/idle eviction and project-removal cleanup. Keep active directories and required in-flight ownership safe. Use the existing config-cache helper for snippets payloads/timestamps, with coordinated metadata cleanup. Do not blindly delete request epochs: an old in-flight response must not become current again after eviction/recreation.
3. **Bound long-conversation residency.** Keep a recent message window plus currently visible history; page older content back from the runtime. Bound large tool-output presentation and associated Markdown/AST residency. Never silently truncate canonical runtime history or unresolved approval data. Proposed byte budgets require workload measurement before being treated as qualified product limits.
4. **Add meaningful diagnostics.** Measure per-process memory (main, renderer, web server, runtime, GPU) separately. Expose all retained message/part counts and estimated content sizes across directories, cache hits/evictions, background-session counts and outstanding resources. The existing MemoryDebugPanel reads the active directory and displays constants from `stores/types/sessionTypes.ts`; those values should not be treated as proof that the sync layer enforces those limits.

## Verification required for a fix

Replace these observational fixtures with regression assertions for the intended limits, including background event ingestion, snapshot ingestion, protected-state safety, idle completion, directory removal and late-response races. Run focused suites, UI type-check and the full UI suite when rendering/project actions change, plus applicable root gates. Verify asynchronous renderer behavior with fresh DOM/state reads through the development WebMCP workflow.

Then run the same packaged-app workload before/after: warm-up, idle baseline, repeated completed background sessions, long conversation/tool output, project switches, terminal open/close and preview open/close cycles. Sample process RSS/private memory and post-GC renderer heap at matched checkpoints. Compare heap retainers and object counts; separate bounded cache warm-up, GC/allocation churn and native/GPU memory from cumulative retention. A passing result requires stabilization under repeated identical cycles, not merely a lower single RSS sample. Runtime/worker process findings must be attributed to their owning component.

## Executed validation and reproduction

Environment: Node `v26.5.0`, pnpm `10.33.4`.

Executed through the UI package test wrapper: observational fixture plus existing event-reducer, session-cache, Markdown worker client and Markdown worker parser suites. Result: **5 files passed, 70 tests passed**. No runtime source was changed. No release, commit, push, or deployment was performed.

`reproduction.test.ts` is an observational investigation fixture archived outside the normal test discovery tree. Its assertions describe the defect in the inspected version; they are not acceptance criteria for a fix. Historical command used for the initial audit (these observations are expected to fail after the fix):

```bash
cp .internal/reports/memory-retention-20261026/reproduction.test.ts desktop/packages/ui/src/sync/__tests__/memory-retention-audit.tmp.test.ts
pnpm --dir desktop/packages/ui run test src/sync/__tests__/memory-retention-audit.tmp.test.ts src/sync/__tests__/event-reducer.test.ts src/sync/__tests__/session-cache.test.ts src/components/chat/markdownWorkerClient.test.ts src/components/chat/markdownWorkerParser.test.ts
rm desktop/packages/ui/src/sync/__tests__/memory-retention-audit.tmp.test.ts
```

The fixture mocks only external input for snippets and holds refetch promises unresolved to observe retained stale payloads. It does not connect to a user's runtime or modify project data.
