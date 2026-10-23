# Archived session cleanup

The local archived-session cleanup stalled because ordinary session deletion requires a live, matching project directory. Historical sessions whose directories disappeared or changed project identity failed before deletion. A live inventory found 763 archived rows, including 319 with missing directories. Additional sessions were archived while the operation was being investigated.

Desktop also treated every HTTP 404 as proof that a session was gone. That confused missing project routes with missing sessions. Conversely, session-specific errors use both the legacy `NotFoundError` envelope and the current `SessionNotFoundError` envelope, which must both remain idempotent when a previously deleted ancestor already removed a child.

## Changes

The canonical AX Code runtime commit is `7862d07c9` in `/Users/akiralam/code/ax-code`.

- Add authenticated `DELETE /global/session/:sessionID/archived` and regenerate both SDK generations and OpenAPI. Ordinary execution, transcript and deletion routes retain their existing project guards.
- Reuse the canonical session removal implementation for registry, shard, cache, shell and derived-data cleanup. Global maintenance uses only existing instance contexts; it never bootstraps a retired project or runs user lifecycle hooks.
- Revalidate the root's archive state and recorded directory in the deletion transaction. Delete archived descendants while retaining active children and their subtrees. Reparent retained children as independent sessions and publish their updated metadata.
- Route Desktop archived-history deletion through that maintenance operation. Reject errors and malformed success acknowledgements. Do not fall back to ordinary cascading deletion when an older runtime lacks this operation.
- Recognize only session-specific 404 responses as already complete. Project, route and other HTTP errors preserve the session and report failure.

## Verification

- Runtime deterministic suite: 16,830 passed, 24 skipped, zero failures; the initial and final result passed without a rerun.
- Full Desktop UI suite: 4,971 passed across 659 files.
- SDK suite: 280 passed across 27 files; SDK regeneration succeeded.
- Focused runtime coverage: 27 passed, including missing directories, historical identities, authentication, active-child preservation, existing-context cleanup and lifecycle-hook suppression.
- Focused Desktop coverage: 88 passed, including maintenance transport, malformed acknowledgements, guarded failure, unsupported routes and both session-specific 404 formats.
- Runtime and UI typechecks, Desktop lint, boundary checks and staged whitespace checks passed.
- Original failing regression outputs and final source hashes are retained with the local operator evidence.

## Local cleanup receipt

The source maintenance pass verified an allowlist of 767 archived records through authenticated in-process requests to the canonical runtime HTTP application. It did not open a listening port, directly delete database rows, bootstrap project instances or run project hooks. Ancestor cascades were accepted only with a session-specific not-found response.

The final receipt records zero archived rows and preservation of all 15,316 IDs that were active at the maintenance snapshot. SQLite `quick_check` returned `ok`. A fresh native accessibility read after the application reloaded showed no Archived groups or archived-delete controls, while active project sessions remained visible.

Local operator evidence, allowlists, receipts and test logs are retained under `.internal/releases/archived-cleanup-20261022-operator/` and are not part of public release assets.

## Delivery state

These are source fixes and a completed local data cleanup. The installed Desktop application, its pinned runtime and its SDK dependency were not replaced. Both repositories retain their existing release identities. A future Desktop release must consume a newly qualified signed runtime containing the producer fix and update the runtime/SDK pins together; the published v7.28.4 tag remains unchanged.
