# Workspace UX v1 implementation and verification

Date: 2026-11-08. Branch: `feat/workspace-ux-2026`, based on `5d34efef`.
Worktree: `/Users/akiralam/code/ax-code-desktop-ux-2026`.
Status: Implemented on `feat/workspace-ux-2026`. The user subsequently authorized committing and pushing this branch.
The original worktree was left on its own branch with its concurrent work preserved.

## Result

- Workspace and Portfolio are primary areas. Portfolio reuses Mission Control; Session grid is reached through Session views,
  and Review changes remains a labeled contextual action. Existing shortcuts, pop-outs and canonical state ownership remain.
- The project sidebar suspends the inspector without unmounting its editor. Opening an inspector hides the sidebar after
  the Files guard accepts navigation. A refusal preserves the current view.
- Inspectors use the full content width below the 70rem workspace threshold. Wide layouts offer Focus panel and Restore
  split view. Back to conversation uses the Files guard. The conversation wrapper remains mounted when opening, closing,
  suspending or focusing inspection, preserving the input DOM node and unsent draft.
- Projects appear before starter suggestions. Grid suggestions initially show three items, with disclosure retaining the
  rest and existing group-local pinning, reordering and custom actions.
- Sidebar identity uses distinguishing path suffixes with a separate bounded path line, full hover text and full accessible
  action identity. Long project names cannot displace the path line. Registered suffix collisions expand the visible context.
- Root runtime retries display Retrying on running supervision rows. Blocking decisions still win; urgency, counts and child
  attribution retain their contracts. All 14 locale catalogs pass validation.
- Sidebar transition defaults live in CSS, allowing reduced-motion rules to take effect; inline styles only suppress
  animation during a live drag. Native checks validate the computed transition preference and settled sidebar width.

The PRD and technical contract are additive records. SDK/runtime pins, dependencies, approval policy and execution ownership
were not changed. The user-facing guide and native UI testing guide describe the new controls.

## Verification

All required root gates passed: `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test`, and `build`.
The complete test run passed 9,007 tests, with 12 existing skipped cases; the UI suite passed all 5,465 tests.
Focused regressions cover navigation rejection, sidebar handoff, unchanged conversation/editor nodes, starter disclosure,
path collisions and full accessible identity, and retry/decision precedence. The panel-handoff regression failed before
implementation. The draft-order source-text assertion was removed in favor of a native rendered-order/viewport regression.

Native fixtures use isolated profiles and disposable repositories. Final receipts: `/tmp/ax-code-desktop-ux-delivered-4_hk_sus`.

| Journey | Checks |
| --- | --- |
| Workspace UX | Projects in the first viewport and before three bounded suggestions; expansion/collapse; Files/sidebar handoff; focused populated diff and return; session-grid menu; Portfolio; the same unsent composer after navigation; light/dark at 1280/800 CSS pixels and focused review at 1600 |
| Projects Home | Distinct same-name cards and child actions, correct project/session routing, pin persistence across reload and restoration, narrow layouts and light theme |
| Portfolio identity | Same-name project decisions and Live rows, complete accessible action identities, correct conversations in default/minimal modes, light/dark and 800/600 CSS-pixel rendering |

A complete identity journey passed after viewport setup corrections. Two neighboring runs timed out after the light-theme
Settings close when reopening Live. Receipts `identity-1` and `identity-repeat-failed` retain those failures;
`identity-passed` retains the complete successful run. The repeat diagnostic confirmed a hidden left sidebar at zero width.
The passing journeys report clean CSP and no uncaught renderer exceptions. Each journey records fresh native control inventories, DOM observations and screenshots.

## Test reliability findings

DevTools device-metric emulation could change `innerWidth` from 1280 to 800 without updating application resize listeners.
A diagnostic found an 800px document/layout while the device hook retained the previous width; delivering resize closed the
sidebar. `desktop-viewport.mjs` selects reduced motion, delivers that notification after emulation and waits through a 350ms resize quiet period. Callers independently
wait for the rendered left sidebar width to reach zero. An inline transition-property declaration previously overrode
the reduced-motion utility; moving defaults to CSS fixes the real preference conflict. The fixture qualifies settled
layout rather than compositor animation timing. The Workspace journey explicitly identifies the hidden left sidebar rather than accepting any hidden sidebar. The diff capture waits for the fixture code to render, rather than accepting a loading skeleton.

Settings can remain in the DOM during a closed-dialog transition. The affected journeys now check opacity and ending-style
visibility instead of requiring DOM removal. Initial timeout receipts were kept separate from the passing final captures.

## Scope of evidence

These are fixture-backed macOS development checks, not a signed release, live-model throughput campaign or user study.
The 600px captures are rendering stress cases, not a changed native minimum-window-size promise. Dirty Files refusal is
covered by behavioral/module and mounted-component regressions; native workspace checks prove composer preservation and
panel handoffs without editing a real project. The full legacy supervision journey is not certified by these bounded runs. The native identity harness still needs
repeatability qualification around Settings dismissal; a passing capture does not establish that this race is resolved.
Narrow titlebar utility compaction remains a follow-up outside this bounded workspace change.
The follow-up delivery instruction authorizes a commit and branch push. Merge and release remain outside this change.

## Review artifacts

- [Implementation plan](../plans/PLAN-2026-11-08-workspace-ux-v1.md)
- [Authorized requirements](../prd/PRD-2026-11-08-workspace-ux-v1.md)
- [Technical contract](../spec/SPEC-2026-11-08-workspace-ux-v1.md)
- Native review: `workspace/review-focused-dark-1600.png`, `workspace/home-dark-1280.png`,
  `workspace/files-light-800.png` under the receipt directory.
- Root gate logs: `/tmp/ax-code-desktop-ux-completion-{check-boundaries,check-locales,typecheck,lint,test,build}.log`.
