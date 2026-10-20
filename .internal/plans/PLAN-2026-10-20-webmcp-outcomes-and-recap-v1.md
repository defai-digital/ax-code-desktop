# WebMCP outcomes and recap implementation plan v1

Status: Planning baseline requested on 2026-10-20 before further product coding.
Product direction: [PRD v1](../prd/PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md).
New product requirements remain proposed; accepted ownership, technical behavior and release decisions are unchanged.

## Planning checkpoint

- Native Desktop UI WebMCP and Settings repairs were already underway under the user's earlier implementation request.
  They remain uncommitted. New recap/product implementation has not started.
- Preserve the separate runtime-pin/test changes and the `.internal/reference` symlink that predate this task. No sibling
  edits, reference imports, dependency migration, version bump, push or release is part of the task commit.
- Native exploration visited all 15 Settings pages. Confirmed defects: missing ARIA options/menus, control truncation,
  missing focus behavior, unnamed fields/icon actions and Hooks crashing on an incomplete payload. Repairs and local
  shortcut search exist in source; final native retest of the latest candidate is pending.
- The latest full UI run passed **558 files / 3,703 tests**. The build subsequently failed on a test mock typing error:
  `updateDesktopSettings` resolves `void`, but the new test mocks `{}`. Correct it and rerun before claiming build success.
- Earlier ordinary E2E runs intermittently failed in pop-out/reload/permission journeys. The narrower WebMCP pass does
  not make that suite green. Keep those failures visible and investigate before candidate qualification.

## Phase A: Finish the authorized Settings/WebMCP repair slice

1. Freeze an initial bug table with reproduction, expected/observed result, cause, regression and retest evidence.
   Distinguish app defects, adapter limits, fixture limits and external-service absence.
2. Correct the test mock type, then finish confirmed Settings defects. Do not expand the adapter into arbitrary JS/IPC,
   a permission engine or a second browser runtime. Add a versioned spec for paging, supported roles and focus/field handling;
   preserve the original v1 record and update current developer documentation.
3. Run the built app through `e2e:desktop:settings-webmcp`: every navigation entry, every control page, useful names/state,
   actual actions and independent observations. Record a control-level coverage matrix, not only a page count.
4. Exercise nested states: select/menu items, theme controls, numeric bounds and invalid drafts, steppers/reset, toggles,
   shortcut capture/search/empty/clear/reset, create/edit/cancel forms and error/retry. Verify saved state where applicable.
5. Use temporary fixture resources for mutations. Inventory external login, download, native-dialog and destructive
   buttons, but record unexecuted actions explicitly. Never delete or rewrite real user skills/accounts during a UI audit.
6. Compare field identity, hierarchy, density, focus, dirty/default state and feedback with the scoped Orca observations.
   Inspect real screenshots in light/dark modes and a narrow window. Fix concrete usability gaps within the current design.
7. Run focused regressions, full UI tests, typecheck, lint, build, locale and boundary/release-identity checks. Run native
   WebMCP and ordinary E2E. Resolve or clearly disposition failures without weakening assertions to make the run green.
8. Repeat scoped exploration after fixes. Close after two clean passes and no unresolved confirmed reviewer finding;
   retain limitations instead of claiming the entire app is bug-free.
9. Commit only task implementation, regressions, docs and evidence. Verify the commit and remaining dirty paths. Keep
   the user's unrelated runtime-pin/reference changes out of the commit; do not push or publish.

## Phase B: Establish the recap failure

1. Trace `/summary`, `/catch-up`, the Catch me up starter, their prompts, SDK requests, error recovery and output location.
   Keep narrative recap separate from diff statistics and context compaction.
2. Reproduce empty project, new draft, existing session, unavailable model, rejected request, project switch during
   generation, restart and returning after other work. Use native WebMCP for UI actions wherever the surface supports them.
3. Classify the complaint: discovery, failed generation, wrong scope/context, weak content, stale result, missing evidence,
   persistence, absence of ready-to-read content, or missing cross-project orientation. Retain exact evidence and regressions.
4. Resolve the pending project/session versus cross-project preference. Meanwhile diagnose the shared project/session path;
   do not infer a daily schedule or autonomous spending policy.
5. Establish what the pinned SDK/runtime actually supports for narrative summaries, goals and evidence. Record absent
   contracts without inventing endpoint names or silently putting canonical generation/history in Desktop.

Deliverable: recap gap report and a bounded technical implementation spec. Confirmed bugs in existing request paths can be
fixed within accepted boundaries; a new durable recap product follows Phase C prerequisites.

## Phase C: Evidence-linked recap vertical slice

Prerequisite: accepted scope; when the producer contract or ownership changes, accepted PRDs/ADRs in all affected repos
and the technical spec required by AGENTS.md. This is an explicit repository requirement, not an inferred approval step.

1. Specify recap identity, goal, progress, verified/unverified outcomes, blockers, decisions, next actions, evidence links
   and freshness. Cover unavailable, loading, ready, stale, partial, error, cancellation and late async results.
2. Keep generation, durable execution facts, tool receipts, policy and spend runtime-owned. Desktop provides a discoverable
   entrypoint and bounded projection. Reading existing content must not silently generate another model request.
3. Implement one user journey: return → understand recap → open evidence → resume the correct session or rerun a check.
   Test wrong-session responses, context changes, mixed outcomes and restart continuity.
4. Use deterministic fixtures for state coverage and separate configured live-runtime qualification for generation and
   persistence. A stub cannot qualify real model output, approvals or canonical durable history.
5. Make refresh cost/cancellation explicit under current runtime policy. Do not add recurring generation or larger budgets.

## Phase D: Enlarge WebMCP's user value

1. Choose concrete web-app jobs: search/filter, create/edit/save a record, validate a form and reproduce a reported failure.
   Define the expected domain/UI result before generating tools or code.
2. Add app-owned semantic tools and lifecycle tests through the runtime coding workflow. Desktop displays available tools,
   scope, activity and results rather than owning a parallel code-generation/workflow executor.
3. Evaluate tool discovery, schema use, execution failures and independent outcome verification. Save bounded redacted
   semantic steps, app/version identity and evidence references. Expiring DOM refs are never durable replay identifiers.
4. Link workflow results into recap. Preserve the difference between site-supplied output, observed UI state, test results
   and runtime-owned completion authority. Recheck scope on navigation and never blindly retry uncertain effects.
5. Compare task completion, attention/correction/review time and recovery with the current app and applicable Orca flows.
   Extend to cross-project orientation after the project/session journey is demonstrably useful.

## Phase E: Validate value with users

Use matched, explicit-acceptance tasks with representative developers and supervisors. Establish baseline orientation
time, accepted verified outcomes, human attention, correction cost and reopened bugs. Segment tasks and experience;
report uncertainty. Prioritize the next gap from observed results. More models, more tools, generated lines, a static
competitor score or an impressive demo do not by themselves establish value.

## Reviewer inputs and disposition

All requested reviewers were used in bounded read-only runs: Grok CLI, Muse CLI and AX Code CLI with DeepSeek, GLM and
MiniMax. Muse/DeepSeek/MiniMax completed source reviews; GLM and Grok completed smaller retries after their first requests
timed out. Completed prose is advisory, not proof of a working feature or visual review of screenshots.

Useful leads being verified: read-only shortcut focus, preserving the current control page after actions, contradictory
disabled/fillable metadata and normal focus/blur behavior. Claims that this app's Settings steppers use shadow-root custom
elements were unsupported. Driver-side clamping would hide application validation defects and is rejected. Nullable Hooks
fields require checking the actual producer contract before changing admission. Matching Orca's keys/types/values is not
a product acceptance criterion. Reviewer output does not authorize changes to runtime or security ownership.

## Completion rule

Phase A is the earlier authorized repair/test/commit slice. Phase B is diagnosis. New recap/workflow implementation waits
for the relevant records/contracts, while document and evidence work proceeds. A plan, code scaffold, passing stub or
reviewer response cannot alone complete a phase. Keep implementation, local validation, commit, push and release distinct.

### Numeric focus qualification follow-up

[Plan](PLAN-2026-10-20-numeric-focus-qualification.md) and
[controlled evidence/report](../reports/WEBMCP-2026-10-20-numeric-focus-qualification.md) distinguish background
activeElement changes from delivered focusout, preserve the strict maximum check and expose documentFocused in the
[v3 development contract](../spec/SPEC-2026-10-20-desktop-ui-webmcp-v3.md). No numeric validation logic or native-window
activation authority was added to the provider. Historical failures without telemetry remain unproven.

### Command editor save isolation follow-up

[Plan](PLAN-2026-10-20-command-save-isolation.md) and
[verification report](../reports/COMMANDS-2026-10-20-save-isolation.md) record same-name cross-project save completion,
stale creation selection, and unchanged-save dirty-state repairs with mounted behavioral regressions.

### Nested editor follow-up

[Agent isolation and nested editor plan](PLAN-2026-10-20-agent-save-isolation.md) and
[verification report](../reports/CONFIG-EDITORS-2026-10-20-isolation-and-narrow-layout.md) record mounted save-race
regressions, native selector naming, and a screenshot-discovered narrow Commands layout defect. The native harness now
checks affected control bounds rather than accepting root overflow checks alone.

### Editor scope display follow-up

[Plan](PLAN-2026-10-20-editor-scope-labels.md) and
[report](../reports/CONFIG-EDITORS-2026-10-20-scope-labels.md) cover translated Global/Project labels in Commands and
Agents, native switching in both forms, clean-state restoration, and screenshot verification.

### Agent parameter controls follow-up

[Plan](PLAN-2026-10-20-agent-parameter-controls.md) and
[report](../reports/CONFIG-EDITORS-2026-10-20-agent-parameters.md) record field-specific numeric control names,
container-based Agent layout, native step/edit/clamp/clear checks, and a foreground-window prerequisite for blur validation.

### Agent permission editor follow-up

[Plan](PLAN-2026-10-20-agent-permission-editor.md) and
[report](../reports/CONFIG-EDITORS-2026-10-20-agent-permissions.md) cover contextual selector/reset names, native unsaved
rule edit/restoration checks and the clipped custom-pattern/action row at narrow editor widths.

### Wildcard permission pattern preservation

[Plan](PLAN-2026-10-20-global-permission-patterns.md) and
[report](../reports/CONFIG-EDITORS-2026-10-20-global-permission-patterns.md) record hidden Default patterns and payload
loss on unrelated edits, repaired visibility/serialization, JSON key preservation, full UI tests and native edit/reset proof.

### Permission pattern capabilities

[Plan](PLAN-2026-10-20-permission-pattern-capabilities.md) and
[report](../reports/CONFIG-EDITORS-2026-10-20-permission-pattern-capabilities.md) record the action-only SDK fields
incorrectly offered for custom patterns, the typed capability filter, and mounted/native regression evidence.

### Four-reference design review

[Comparison](../reports/DESIGN-2026-10-20-reference-comparison.md),
[proposed requirements](../prd/PRD-2026-10-20-reference-informed-supervision-v1.md) and
[plan](PLAN-2026-10-20-reference-informed-supervision-v1.md) combine pinned local OpenChamber, Orca, Herdr and OpenCode
inspection with online primary research. They prioritize identity, readable saved recap and observable schedule outcomes.

### Needs You project identity

[Plan](PLAN-2026-10-20-needs-you-project-identity.md) and
[report](../reports/SUPERVISION-2026-10-20-needs-you-project-identity.md) record duplicate-label ambiguity and hidden
project context at narrow widths. Mounted regressions and a two-project native WebMCP journey verify visible paths,
correct conversation navigation, light/dark rendering and the unchanged default harness.

### Live identity and actionable controls

[Plan](PLAN-2026-10-20-live-project-identity.md) and
[report](../reports/SUPERVISION-2026-10-20-live-project-identity.md) cover the same-name Live rows, minimal-mode context,
and duplicate inert WebMCP actions inherited from a pointer drag wrapper. Mounted and native regressions verify both
projects in default/minimal modes; screenshots record the narrow-layout limits as well as the repaired sidebars.

### Project headers and scheduled targets

[Plan](PLAN-2026-10-20-project-and-schedule-targets.md) and
[report](../reports/SUPERVISION-2026-10-20-project-and-schedule-targets.md) cover collisions after sidebar name formatting,
same-title cross-project task actions, exact pause destinations, real editor/picker selection and the screenshot-discovered
Projects Home toolbar overlap. Scheduled definitions remain unchanged during native verification.

### Projects Home cards and child actions

[Plan](PLAN-2026-10-20-project-home-targets.md) and
[report](../reports/SUPERVISION-2026-10-20-project-home-targets.md) cover ambiguous card/child names, visible duplicate-title
paths, whitespace and label/path collisions, exact compact attention destinations, and native pin persistence/reload.

### Shortcut capture exit and keyboard navigation

[Plan](PLAN-2026-10-20-shortcut-capture-exit.md) and
[report](../reports/SETTINGS-2026-10-20-shortcut-capture-exit.md) cover capture state after Escape/chord completion,
Tab navigation and explicit Tab capture, composition events, global binding containment, and native save/reload/reset.
The refreshed full Settings audit is supplemented with delivered key events instead of treating field focus as proof
of keyboard behavior.

### MCP inventory and save completion isolation

[Plan](PLAN-2026-10-20-mcp-save-isolation.md) and
[report](../reports/SETTINGS-2026-10-20-mcp-save-isolation.md) cover delayed cross-project save completions, draft and
busy-state ownership, immediate clean baselines and a native two-stage directory/inventory race. Two native passes
use intercepted HTTP configuration fixtures; no real MCP process, OAuth or configuration writer is qualified.
Remaining create-edit and concurrent-auth leads are explicitly unconfirmed, and the broader audit stays active.

### MCP creation edit continuity

[Plan](PLAN-2026-10-20-mcp-create-edit-continuity.md) and
[report](../reports/SETTINGS-2026-10-20-mcp-create-edit-continuity.md) confirm and repair the subsequent create-edit
lead: inventory refresh and successful handoff preserve newer fields and use the submitted baseline. The added unsaved
status is verified unobscured at narrow dark/light sizes. Earlier pending-overlay screenshots are explicitly rejected
as visibility evidence. Global config-update feedback/occlusion and stale sidebar mutation targeting remain follow-ups.

### Configuration feedback and overlay observation

[Plan](PLAN-2026-10-20-config-update-observation.md) and
[report](../reports/SETTINGS-2026-10-20-config-update-observation.md) confirm false restart feedback and Dismiss consuming
pending ownership. Neutral copy, presentation-only dismissal and an additive native overlay flag repair those bounds.
Final card/mark contrast has rendered evidence. v4 preserves semantic actions without claiming physical pointer access;
keyboard containment, real restart/recovery and stale sidebar mutation targeting remain separate follow-ups.
