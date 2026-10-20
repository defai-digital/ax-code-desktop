# MCP save completion isolation

Date: 2026-10-20. Baseline `303f0475`. Authorized Settings/WebMCP repair continuation under the existing audit PRD.
No runtime, SDK, credentials, trust, permission or lifecycle contract changes are planned.

## Source lead

McpPage.handleSave awaits create/update and pending-auth cleanup, then updates form baseline, draft, selection and
saving state. Its completion path has no apparent form-generation check. Runtime-action keys already guard other
async operations, and directory-aware loading protects inventory reads; neither proves save completion is isolated.

## Reproduce, repair and verify

1. Add mounted tests with deferred mutations: same-name servers across two projects, leave/return, create after switching,
   same-form edits during save, and navigation during pending-auth cleanup. Preserve success/failure and reload feedback.
2. Reproduce at least the confirmed UI defect through native WebMCP with isolated fixtures and independently observe
   drafts, selection and dirty-state behavior. No real MCP process, OAuth, external network or user configuration writes.
   Inspect configuration routes before choosing fixture setup; do not assume user-scope writes are isolated.
3. Apply the smallest lifecycle/form guard within Desktop. Preserve acknowledged mutation outcomes and origin scope;
   late completions cannot modify another form. Cover repeated saves and fresh drafts without blocking unrelated work.
4. Request bounded Grok/Muse advisory input on the concrete scope; independently disposition claims. Earlier five-model
   reviews remain linked to their original evidence, not approval of this change.
5. Run relevant tests/typecheck/build/lint and required broader checks, repeat the native journey, inspect populated
   light/dark/narrow layouts and commit scoped changes/evidence. Preserve all unrelated dirty files; no push or release.

Stop short of claims about durable idempotency, actual MCP connection/authentication or live provider isolation unless
those behaviors are separately exercised. A source lead or passing acknowledgement is not a confirmed repair.

## Reproduction extension

Native baseline testing also confirmed a two-stage project-switch race: currentDirectory changed before the new
inventory arrived, so the form marked the old server values as loaded for the new directory and skipped the later
correct inventory. The repair includes non-persisted inventory provenance, rejecting mismatched form population and
editing, and retry after an unsuccessful scoped load. Existing async list sequencing remains intact. Mounted tests
exercise separate directory and inventory renders, cache provenance, and pending loads; native tests intercept every
configuration HTTP method before opening MCP, so fixture mutations cannot reach the real filesystem configuration
writer. This extends the same Desktop form isolation repair; it adds no runtime ownership or public API contract.
