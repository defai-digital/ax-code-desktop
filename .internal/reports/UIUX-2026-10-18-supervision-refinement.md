# Supervision usability implementation

Date: 2026-10-18
Status: Implemented and locally verified; scoped commit prepared.
Scope: PRD-2026-10-18-supervision-usability-v1 and the separately requested PRD/ADR lifecycle cleanup.

## Plan and reviewer disposition

1. Make permission scope available in-place, including long individual patterns, while retaining once/reject and question operations. DeepSeek identified same-tick double dispatch; guard the in-flight operation with a ref. Preserve StrictMode mount/unmount behavior. Do not introduce an approval policy requiring expansion.
2. Share UI state presentation between board and compare. Verify the sidebar separately: its `running` and `done_with_uncommitted` states can reuse the same tone without equating its unread state to a runtime state.
3. Add a labeled navigation group above the existing workspace. These are new entry controls for existing views, not new destinations. Leave terminal, split, browser, context and utility controls in the titlebar after reviewer warnings about non-equivalent semantics. Remove only the relocated desktop Mission Control button; retain the mobile titlebar entry. Unsaved Files guard must run before leaving the board for review.
4. Reflow the board using CSS container queries with a persisted comfortable/compact preference. Keep DOM row identity and board keyboard navigation. Wrap the header and replace invalid filter-tab semantics with pressed filter buttons.
5. Expand inspector labels on request, preserving action order and focus. At narrow container sizes labels overlay the right edge rather than squeezing the chat. Keep terminal in its bottom dock.
6. Archive obsolete preparation assumptions and the stale producer proposal, index every PRD/ADR, and preserve accepted original bytes and remaining requirements. See the separate governance report.

## Reviewer evidence

- Grok plan: `../reviews/uiux-2026-10-18/grok-plan.md` (CLI completed successfully).
- DeepSeek plan: `../reviews/uiux-2026-10-18/deepseek-plan.md` (AX Code terminal result recorded).
- GLM plan: `../reviews/uiux-2026-10-18/glm-plan.md` (AX Code terminal result recorded).
- Muse: subscription quota exhausted (HTTP 429); no review obtained. User explicitly requested skipping Muse.

All reviewer claims were treated as leads. Initial snapshots omitted sidebar and board owner code; both were inspected directly before changing them. No framework migration, runtime fork, publishing or accepted contract rewrite is included.

## Validation

The candidate is isolated from concurrent chat/markdown/event-pipeline work in a detached validation worktree based on `0ab190dab446b6c150b2a171a6f6e382f9960559`. It uses the repository's frozen lockfile (`pnpm install --offline --frozen-lockfile`). Final source checksums are recorded in [source-files.sha256](uiux-2026-10-18/source-files.sha256).

| Check | Result |
| --- | --- |
| Full `pnpm run test` | 5,427 passed, 10 skipped: scripts 195/7, Electron 639/1, UI 3,167/0, web 1,426/2 (passed/skipped) |
| `pnpm run typecheck` | Passed for UI, web and Electron runtime syntax |
| `pnpm run lint` | Passed in the isolated candidate |
| `pnpm run check:locales` | Passed: 14 locales, 4,873 keys, 63,349 translated entries |
| `pnpm run build` | Passed: UI, web and Electron shell (three tasks) |
| `pnpm run check:boundaries` (includes release contract) | Passed all ownership, store, runtime, endpoint, IPC, package-test, pin, policy and release checks |
| Renderer fixture | Passed six width/density combinations and German label/Escape checks |
| Governance audit | Four byte-identical preserved originals; 45 index/stub links resolve; 16 ADR bodies unchanged and indexed |

The suite reports existing web-test deprecation/dynamic-import/hoisting warnings. The fixture has no backend and logs expected missing-home/settings and development CSP warnings. No errors were reported by the renderer assertions. This is local source/build verification, not signed package or release qualification.

## Implementation review dispositions

Grok, DeepSeek and GLM completed their second, read-only reviews successfully. Their original outputs are recorded in [Grok](../reviews/uiux-2026-10-18/grok-implementation.md), [DeepSeek](../reviews/uiux-2026-10-18/deepseek-implementation.md) and [GLM](../reviews/uiux-2026-10-18/glm-implementation.md). The input deliberately excluded locale files and contained a diff, not every unchanged owner function.

| Lead | Verification and disposition |
| --- | --- |
| Density select receives board shortcuts | The unchanged handler already excluded `input, textarea, select` before navigation. Extend the separate Escape path to exclude select too. Full-board tests prove native keys are not canceled and selection does not move; board keys still work. |
| Missing translations/icons | False positive from excluded locale files. Nine added keys exist in all 14 locales; `header.navigation.mainAria` already existed. Typecheck and locale completeness verify the contracts. |
| Mobile Mission Control entry removed | Keep the original titlebar entry on mobile while relocating it on desktop. Sidebar access remains too. |
| Disclosure reveals nothing for two medium-length scopes | Reproduced and fixed: use the actual per-pattern truncation threshold. Regression covers two 100-character scopes and a single long scope. |
| Tool toggle width and accessible name | Use a collapsed chevron with an accessible name, and include visible “Tools” in the expanded name. German rendering is checked. |
| Tool badge floats over labels | Anchor the count to the icon; preserve 99+ behavior. |
| Narrow tools cannot collapse with Escape | Add Escape collapse and return focus to the same toggle. The overlay stays below primary navigation and preserves chat width. |
| Workspace closes an unsaved editor silently | `closeBesideChat` already guards Files. Workspace only calls close when the pane is Diff. Review calls the same guard before clearing the board; the Files editor owns its discard dialog. No duplicate toast is added. |
| Workspace tab does not normalize chat | Desktop's existing `resolveBesideChatRedirect` converts secondary main-tab requests into a pane; chat remains mounted. `openBesideChat` also resets the request. No second navigation owner is introduced. |
| Direct board state bypasses effects | The existing store toggle has no analytics/history side effects; explicit open/close preserves intent when navigating from comparison. |
| Sidebar color change | Intentional requirement: working green, review blue, requests amber. Sidebar's specific accessible uncommitted-work label remains unchanged. |
| Grid cells/hidden evidence | Board has `role=grid`, rows have `role=row`, and six cells retain identity. `EvidenceText` returns a plain span with no forced truncation. |
| Compact should always be one line | Keep the wider 68rem threshold to preserve readable labels/evidence. Compact still reduces spacing at every width; narrow cards and medium two-line rows are intentional. The fixtures verify the chosen layout instead of treating one line as a universal goal. |
| Truncated permission previews should force review | Do not introduce a new approval policy. Summaries are explicit and all strings are available verbatim in-place. Existing once/reject payloads and risk indicators remain. |
| Compare/remove focus styles and animation variants | Existing native button focus behavior remains; motion-safe pulses respect reduced motion. These cosmetic variants are not a blocker for this bounded refinement. |

## Rendered evidence and limits

The [fixture instructions](uiux-2026-10-18/harness/README.md) explain reproduction and boundaries. Real components/styles were rendered in Electron with synthetic data, not a connected runtime. The fixture does not certify native installation, release readiness, accessibility conformance, or production task completion.

- [420px permission disclosure](uiux-2026-10-18/420-comfortable.png): all patterns wrap verbatim; controls stay in the container.
- [760px comfortable board](uiux-2026-10-18/760-comfortable.png): rows adapt to available space.
- [1440px compact board](uiux-2026-10-18/1440-compact.png): all six states and project/evidence/action columns.
- [420px German tool labels](uiux-2026-10-18/420-tools-de.png): labels wrap and primary navigation remains uncovered.
- [Machine-readable renderer checks](uiux-2026-10-18/results.json): six width/density combinations, no horizontal body/board/first-row overflow, six states, full scope disclosure and eight tool actions. German overflow and Escape are also asserted by the runner.

## Document lifecycle result

Four records were moved into completed/historical storage with original-path navigation stubs. Their archived bytes match the pre-change Git objects. All 16 accepted ADR bodies remain unchanged and indexed; both ADR-009 filenames remain stable. Remaining signing, continuity, runtime and release requirements were not discarded. See [the lifecycle report](GOVERNANCE-2026-10-18-document-lifecycle.md).
