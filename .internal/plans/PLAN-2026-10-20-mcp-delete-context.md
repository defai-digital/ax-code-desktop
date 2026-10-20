# MCP deletion context and stale inventories

Date: 2026-10-20. Baseline `af3a3947`. Authorized Settings/WebMCP audit continuation, no runtime/SDK ownership changes.

1. Reproduce delayed project inventory: old sidebar actions must not target the new directory. Native fixture intercepts
   every config HTTP method; it may record a wrong-target DELETE in memory, never against real files or MCP processes.
2. Add mounted sidebar/page and store negatives for old confirmation state, late completion after navigation, preserved
   same-name selection/draft/replacement in another context, current-context success and failure/retry.
3. Show lists/actions only when inventory provenance matches the current directory. Reset menus/dialogs/busy state on
   context changes; generation-guard late local completion. Keep browser tools and explicit inventory retry discoverable.
4. Reconcile delete selection only in its origin directory with current inventory/current draft intent. Preserve mutation
   acknowledgement and diagnostics even after navigation. Do not claim runtime idempotency or per-record revisions.
5. Request bounded read-only Grok/Muse advice, independently disposition leads, run focused/typecheck/lint/full UI/build
   and boundary checks, repeat native deferred scenarios and inspect populated narrow/light/dark layouts. Commit scoped
   code/evidence. Preserve unrelated dirty files/reference symlink; no push or release.

Global overlay keyboard containment and concurrent OAuth remain separate leads. Native semantic actions do not qualify
physical access through dialogs/overlays; record such test limits explicitly.

Visual review extension: after a failed project inventory load with no selected server, the detail empty state still
advertises Add while creation is correctly disabled. Move scoped loading/error feedback before that empty state,
preserving the independent browser-tools branch, so the available retry path and instructions agree.

Replacement handoff extension: preserving a same-name post-delete selection must also load its replacement fields,
including a user-scope record revealed after removing a project override. Add a scoped, non-persisted UI selection
revision and refresh it only from the still-owning delete context; use it for form/load/auth context and keep creation
handoff keys consistent. This is not a record version or runtime identity. Add mounted and native replacement cases.
Accepted same-directory inventory scope changes also advance that projection, so a project-to-user handoff does not
depend on an old mounted caller still existing. Explicit new drafts remain intact. Owner-triggered reload checks its
captured projection revision to avoid a duplicate reload after the scope handoff already occurred.
