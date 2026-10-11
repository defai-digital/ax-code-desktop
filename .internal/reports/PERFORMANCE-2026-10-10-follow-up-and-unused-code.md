# GUI hot-path follow-up and unused-code cleanup

## Scope and evidence limits

Keep Electron and review the remaining GUI costs after `d37085e`. The earlier
development process has exited with code 143; no active GUI workload was
available for a live CPU, input-latency, or frame-rate trace. Findings below come
from source review, import reachability, production bundle analysis, and tests.
The earlier testing session used `pnpm run dev`; production-build measurements
must not be treated as measurements of Vite development-mode responsiveness.

## Remaining hot paths, in priority order

1. **Input history subscribes to assistant streaming.** `ChatInput-impl.tsx`
   calls `useUserMessageHistory`. That hook subscribes through
   `useSessionMessageRecords`, filters all records for user messages, and rebuilds
   the history strings whenever the record list changes. Assistant deltas can
   therefore trigger input-history work and a ChatInput render even though the
   user's previous inputs have not changed. Prefer a user-message-specific
   subscription and stable history snapshot in a subsequent performance change.
2. **Active-session snapshots still scale with history.** The batch and change
   hints avoid repeated publications and background-session scans, but
   `snapshotPartsMatchState` and `buildSessionMessageRecordsSnapshot` still walk
   the active session. `MessageList-impl.tsx` then deduplicates and normalizes the
   message collection and builds turn indexes. Historical turn derivation is
   now reused, but virtualizing DOM rows does not eliminate these upstream walks.
3. **Long live Markdown tails remain main-thread work.** Incremental parsing
   benefits completed blocks; long paragraphs and reference-definition fallback
   can still process a large live block repeatedly. ReactMarkdown, layout, and
   ResizeObserver-driven measurements add further work. Measure these before
   changing parser semantics or update cadence.
4. **Startup eagerly includes optional UI work.** The static main-window module
   closure includes ChatInput, message rendering, dialogs, preview code, the
   English dictionary, and SDK bindings. The chunk named `ThemeProvider` is a
   shared bundle; its name does not mean the small ThemeProvider component is
   responsible for its entire size. Snapshot engines were one confirmed
   unnecessary startup dependency and are deferred by this change. Large lazy
   Shiki language chunks are outside this static closure.

These identify costs and candidates, not a confirmed root cause of the reported
user-visible slowness. Next profiling should separate startup, session switching,
streaming-time input, and scrolling under the same workload.

## Completed cleanup

An AST import graph rooted at the web main and mini-chat entrypoints found four
unreachable runtime modules. Whole-workspace reference searches confirmed that
their only consumers were within this group or its dedicated tests. The
`remote-instances` settings metadata explicitly returns false from
`isAvailable`; no active route imports these screens.

Removed six files (2,933 lines):

- `RemoteInstancesPage.tsx` and `RemoteInstancesSidebar.tsx`.
- `lib/desktopSsh.ts` and `stores/useDesktopSshStore.ts`.
- Their two dedicated test files (ten tests).

Retained the disabled settings-route identity, existing legacy-settings cleanup,
and its host/server tests. Type declaration files and test-only helper modules
are also retained: lack of a production import does not make them unused.
Reachable local TS/JS modules remain 766 before and after this deletion. The
deleted files were already absent from the runtime bundle, so deleting them
alone leaves static JavaScript byte totals unchanged.

## Completed startup improvement

Preview and message screenshot engines now load inside the existing async
capture handlers. The imports occur before capture-related DOM mutations;
existing fallback/error handling remains in place. Screenshot functionality and
dependencies remain available, with the loading cost moved to first capture.

| Static main-window JS closure |    Before |     After |       Reduction |
| ----------------------------- | --------: | --------: | --------------: |
| Raw bytes                     | 3,731,492 | 3,557,777 | 173,715 (4.66%) |
| Sum of per-chunk gzip bytes   | 1,092,399 | 1,035,944 |  56,455 (5.17%) |

The closure follows static import/export dependencies of the production main
entry and its UI bootstrap. It excludes optional dynamic imports, CSS, fonts,
WASM, and Electron/runtime processes. Gzip is a comparative size estimate,
not a measurement of local app protocol transfer. This is reduced startup
payload, not a measured startup-time or steady-state FPS improvement.

## Validation

The UI suite passes 249 files and 1,581 tests, including a new regression proving
that preview metadata and proxy-key functions remain usable without loading
either screenshot engine. Full typecheck, lint, contract/boundary checks,
`git diff --check`, and the production Desktop build passed. The build includes
web assets, Electron bundles, and the node-pty rebuild on macOS arm64.
Real screenshot capture, live renderer traces, and other platform builds remain
unmeasured in this follow-up.
