# Preserve edits while creating MCP servers

Date: 2026-10-20. Baseline `f411d50e`. Local Desktop repair, no push or release.
See [plan](../plans/PLAN-2026-10-20-mcp-create-edit-continuity.md),
[receipt](SETTINGS-2026-10-20-mcp-create-evidence.json) and
[five-model review disposition](../reviews/mcp-create-2026-10-20/README.md).

## Confirmed defect and repair

Creating a server triggered an inventory refresh before the mutation promise resolved. For an unchanged draft name,
the arriving record changed `isNewServer` to false and populated the submitted values over newer local edits. For a
renamed draft, clearing the draft/selecting the created name after success performed that overwrite. Background
inventory refreshes also repopulated an idle edited draft.

The draft now remains its editing context until explicit successful handoff. Its initial fields populate once for
each draft object and directory/name key. A background inventory is not a replacement draft. On acknowledged success,
the same-generation form advances its baseline to submitted values and marks the created name/directory already
loaded before clearing the draft and selecting its server. Current local fields survive and remain dirty if newer.
Name/scope stay fixed during submission; the failed-create path unlocks them. A same-name arrival keeps the draft
and rejects duplicate creation instead of silently becoming an update.

Dirty existing MCP forms now show a translated inline "Unsaved changes" status. The action row wraps at narrow widths.
Creation success therefore does not imply the later local edits were submitted. The prior cross-project generation
and inventory-provenance guards remain intact. No runtime, SDK, OAuth or configuration-file schema changes.

## Reproduce and retest

- Mounted negative: `/tmp/ax-mcp-create-negative-unit-20261020.log`, 15 tests, 2 failures. Default-name creation loses
  the newer URL at inventory arrival; renamed creation loses it at the resulting real selection/draft transition.
- Native negative: `/tmp/ax-mcp-create-native-negative2-20261020.log`, 15 native actions and one completed POST.
  The UI field reads `https://submitted-0.invalid` after editing it to `https://new-unsaved-0.invalid` while creation
  was pending. The initial `negative` setup used display-cased transport text rather than the accessible label
  `Remote · SSE`; that setup failure is not a product finding.
- Native `fixed1` and `fixed2`: both exit 0, each 49 native actions, 12 HTTP requests, 3 POSTs and 2 PATCHes. Covers
  default/renamed creates with newer URLs, submitted-baseline reversion, exact follow-up update name/payload, unchanged
  creation becoming clean, return to the saved fixture and dark/light narrow layouts. Native WebMCP performs actions;
  CDP provides HTTP interception, viewport and independent DOM/screenshot observation.
- `visual-verified`: exit 0, 53 native actions, 16 HTTP requests, 3 POSTs and 4 PATCHes. Extends those cases with a dirty
  form in each narrow theme. Delivered wheel input scrolls the viewport; an elementFromPoint check independently
  requires the unsaved status to be unobscured before capture. Actual wide and 800 by 700 light/dark screenshots were
  inspected: the status wraps below Save/Delete without horizontal overflow or a global overlay covering the text.

All configuration HTTP methods under `/api/config/mcp*` are intercepted before opening MCP. Only disabled remote
`.invalid` project-scoped servers with OAuth off are accepted. Writes are answered in memory, never continued to the
real configuration writer. Follow-up PATCHes verify the new values actually reach that fixture inventory. This is
not disk persistence, a real MCP connection, authorization exchange, runtime restart or durable-execution qualification.

## Visual-evidence correction and remaining overlay problem

The first extended `visual` run returned success because the status rectangle lay inside the viewport, but inspection
showed the global configuration overlay covering it. That run is not accepted as visual proof. The corrected final
check captures the dirty state before submission, checks hit-testing as well as bounds and retains the obscured
screenshots rather than retroactively treating them as passing visibility evidence.

The current config overlay displays "AX Code is restarting" immediately after `startConfigUpdate`, before any mutation
response and even for this fixture's eventual `requiresReload: false`. It blocks physical pointer access while the
native WebMCP provider can still invoke underlying handlers: controls are not made inert and the provider checks
layout visibility, not global occlusion. Thus in-flight edit cases qualify the handler/state transition through native
tools; they do not prove a human can pointer-click through the overlay. Idle draft refresh preservation and final dirty
visibility are separately tested without a pending mutation. Config feedback stages and native busy/occlusion semantics
require a subsequent scoped review/repair; this patch does not claim to fix them.

## Verification

- Focused mounted/store tests: 21 passed, including newer/default/renamed creation edits, background inventory, duplicate
  arrival, failed creation/retry, clean creation and the earlier cross-project/save/auth-cleanup cases.
- Full UI: 568 files, 3,809 tests passed with `--maxWorkers=4`; no timeout or assertion changes.
- Build, separate final UI typecheck, focused ESLint, boundary/source-text and release-identity checks passed.
- Locale check: 14 locales, 4,940 keys and 64,220 translated entries. Unsaved status copies the established translation
  wording into an MCP-specific key; no unrelated locale entries changed.
- Prior native cross-project MCP save regression: exit 0, 24.1 seconds.
- All-Settings regression: 15 pages, 616 control observations, exit 0, 43.6 seconds.
- Ordinary default-path desktop E2E: all 10 checks, exit 0, 14.1 seconds.
  Terminal receipts are `/tmp/ax-mcp-create-regressions-20261020.json` and the corresponding `*-regression-*` logs.
- Muse/DeepSeek/MiniMax completed advisory reviews. Grok timed out and GLM returned an internal timeout with no answer;
  neither counts as approval. Unsupported claims about missing finally, a load-branch save flag and server name
  normalization were checked against the complete source and not adopted.

## Next checks

The sidebar's delete target retains a server name without origin directory, while `deleteMcp` resolves its directory
at invocation. The sidebar also displays its current inventory without checking `loadedDirectory`. A delayed project
inventory may therefore expose stale actions; this remains a source lead until a populated native delayed-read case
reproduces it. No DELETE or sidebar repair was qualified here. Concurrent OAuth also remains outside this evidence.

The broader WebMCP audit stays active. All unrelated dirty files, runtime pin and reference symlink are preserved.
