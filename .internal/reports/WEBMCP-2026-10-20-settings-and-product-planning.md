# WebMCP Settings repair and product planning

Status: Local development qualification and a proposed product plan. No push, package publication or live-model
qualification. The broader all-buttons/recap investigation remains open under the implementation plan.

## Product record

The user requested a PRD and plan before further product coding. Commit `2fc04eae` adds
[PRD v1](../prd/PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md) and
[plan v1](../plans/PLAN-2026-10-20-webmcp-outcomes-and-recap-v1.md). New recap/workflow requirements remain proposed.
The existing authorized Settings repair slice is separate from implementing the new runtime-owned recap contract.

Position: use WebMCP to exercise the user's app, verify real outcomes, retain reproducible failures and resume from an
evidence-linked recap. Declared tools or successful invocation alone do not establish task completion. Research and
Orca source references are in the PRD; no Orca code was copied.

## Confirmed defects and repair evidence

| Defect | Reproduction and repair | Verification |
| --- | --- | --- |
| Select/menu choices absent from tools | Open an ARIA select/menu; its options/menu items were excluded by discovery. Include the actual supported ARIA roles. | Provider regressions; native language selection changes visible text and closes the select |
| Shortcuts tail unavailable | More than 100 controls were truncated without a continuation. Add bounded offset/nextOffset paging and preserve the action's page. | Provider regressions; native discovery reaches the last shortcut |
| Shortcut capture cannot focus | Read-only fields were rejected by click; click/fill also missed normal focus behavior. Permit non-sensitive read-only focus, focus ordinary actions, keep fill read-only rejection. | Provider regressions; native activeElement check |
| Ambiguous or unnamed controls | Numeric fields, shortcut fields and several icon-only add/more actions lacked useful names. Label them and contextualize row/stepper actions. | Inventory all 15 tabs; no unnamed rendered controls in the scoped snapshots |
| Hooks content crashes | Incomplete successful response `{}` reached a component assuming arrays/file metadata. Validate the published response shape and use the local load-error/retry surface. | Malformed-payload regressions, valid retry recovery component test and native error/retry without an error boundary |
| Shortcuts hard to find | A long list had no local action/chord filter. Add search, result count, empty result, clear and meaningful per-row actions/default state. | Component tests and native search/clear/count checks |
| Shortcut values clipped at 800px | The window breakpoint forced a row layout even though Settings' content panel was narrower. Use the panel's container width and preserve capture-field width. | Native narrow-window width assertion plus screenshot inspection |
| Settings shortcut closes after reload | Native menu opens Settings while renderer shortcut toggles it; duplicate delivery can close it. Make Open settings idempotent like the menu; remove misleading close-via-open-shortcut tooltip. | Native ordinary E2E repeats the shortcut and checks Settings again after reload |

The first language-selector failures were test assertion mistakes (`aria-label` versus the actual `aria-labelledby`),
not a failed app selection. Screenshots showed English selected. The assertion was corrected without changing selection
behavior. A stronger splash readiness gate alone did not resolve the reload failure; the original failure is retained.
The diagnostic recorded a delivered Meta-comma, prevented default, focused document and no splash, yet no Settings.

## Scope and privacy

The native audit uses the built Electron app, native `WebMCP.enable`/`invokeTool`, an isolated profile/project and a stub
runtime. DOM assertions and screenshots are independent observations. Credentials, live model output and signed
packaged qualification are not exercised. Generic tools are explicit opt-in and disabled for packaged apps.

All 15 Settings navigation pages are inventoried, including paged discovery. Targeted executed actions cover native
options, numeric editing/step/reset, reversible Appearance/Chat checkboxes, shortcut focus/search/empty/clear,
light/dark/system theme controls, narrow layout and Hooks retry. Inventory observations include repeated navigation
controls; their total is not a count of unique controls or executed buttons.

Not executed: external login/OAuth, downloads, native file dialogs, notification authorization, global shortcuts,
destructive actions against real skills/accounts/projects, and every nested create/edit/save/cancel combination.
Those require a broader fixture-backed matrix; they are not marked passed. Real user skill/identity names can appear
in local screenshots because those catalogs are read from the host. Raw screenshots/state stay in `/tmp`; the committed
coverage summary contains page counts/role totals and the safe test action list only.

## Recap diagnosis checkpoint

Source: `draftStarters.ts`, `ChatInput-impl.tsx`, `magicPrompts.ts`, session sidebar types and supervision projections.
`/summary`, `/catch-up` and Catch me up exist. The summary command appends an assistant response without compacting
history. Catch-up asks the model to inspect git state. The existing submit regression covers catch-up retaining its draft
target while selection changes; it does not prove generation quality or persistence.

Diff summary metadata is not narrative recap. This inspection has not established a ready-to-read persisted recap when
returning to a project, nor reproduced every reported live generation failure. Plan Phase B records the required state
matrix; Phase C requires producer/consumer contracts before new durable recap implementation. No new recap endpoint,
runtime, schedule or spending policy was introduced.

## Advisory reviews

[Grok, Muse, DeepSeek, GLM and MiniMax outputs](../reviews/webmcp-settings-2026-10-20/README.md) were completed as bounded
read-only leads. Initial Grok/GLM timeouts do not count as review evidence; completed retries are identified. Findings
were checked against source and reproduced where applicable. None is a visual sign-off or a live-runtime qualification.

## Local verification receipts

Initial post-repair UI suite: 558 files / 3,703 tests. Electron suite: 91 files, 746 passed / 1 skipped. Native Settings
passes before the final visual repair: `/tmp/ax-desktop-settings-webmcp-pass2-20261020`,
`/tmp/ax-desktop-settings-webmcp-pass3-20261020` and `/tmp/ax-desktop-settings-webmcp-visual-20261020`.
Two ordinary E2E attempts failed reload while the other journeys passed; a readiness-only attempt still failed.
Final candidate receipts are recorded below after completion; earlier failures are not overwritten.

- Final `pnpm run build`: passed (3 tasks). `pnpm run typecheck`, lint, locale check and `check:boundaries`: passed.
  Boundary receipts use the working tree's existing runtime pin 7.27.7 and SDK pin 2.6.37; these pins are outside this commit.
- Final full UI suite: **558 files / 3,703 passed**. Web suite: **139 files / 1,453 passed / 2 skipped**.
- Electron suite: **91 files / 746 passed / 1 skipped** before the final harness-only regression addition; focused final
  harness/client suite: **23 passed**.
- Ordinary E2E: **all journeys passed**, including repeated Settings shortcut, pop-out, reload, approval, denial, goal
  projection, CSP and renderer errors: `/tmp/ax-desktop-e2e-idempotent-settings-20261020`.
- Root script tests: **235 passed / 7 skipped / 2 failed**. Both failures are release-test SDK expectations of 2.6.38
  versus the configured SDK 2.6.37. The edited expectations in `script/desktop-release-contract.test.mjs` and
  `script/shadow-release-evidence.test.mjs` are pre-existing excluded work. Do not change the pin or these tests to make
  this task green, and do not describe the complete repository suite as passing.

The remaining Settings action matrix and live recap diagnosis are planned work, not completed product capabilities.

- Final native Settings pass: `/tmp/ax-desktop-settings-webmcp-final-20261020` (**614 control observations**).
  Confirmation pass: `/tmp/ax-desktop-settings-webmcp-confirm-20261020` (**619 observations**). Both passed all targeted
  interactions, all 15 tabs, CSP and uncaught renderer checks. Counts vary with loaded catalogs/session chrome; no exact
  count is used as a correctness assertion. No additional reproducible defect was found in these two scoped passes.
- Inspected the final light/dark desktop and 800x700 light screenshots. The narrow shortcut fields now keep their full
  width and stack under their labels. This is the scoped visual improvement; it does not establish complete Orca parity.
- Scrubbed [coverage summary](WEBMCP-2026-10-20-settings-coverage.json) records page/role counts and executed safe actions.
- Harness failure-detection self-test passed: deliberate CSP and uncaught renderer failures remained detected after
  reload, while the reload/Settings journey passed (`/tmp/ax-desktop-harness-self-test-20261020`).
