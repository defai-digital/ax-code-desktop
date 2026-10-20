# WebMCP outcomes and project recap v1

Status: Proposed product direction, written at the user's request on 2026-10-20 before further product coding.
The previously authorized Settings/WebMCP repairs are in progress; that does not establish acceptance or implementation
of the new recap/workflow requirements. This proposal does not supersede an accepted PRD, ADR or technical spec.

Related: ADR-002, ADR-009, ADR-013, ADR-014, ADR-015; competitive quality v1; trusted supervision v1;
[implementation plan](../plans/PLAN-2026-10-20-webmcp-outcomes-and-recap-v1.md).

## 1. Position and user value

**AX Code helps users develop, exercise and verify web applications through WebMCP, and return to their work with a
trustworthy recap of outcomes, evidence, blockers and the next useful action.**

The promised result is a feature demonstrated through the user's workflow, a reproducible failure when it does not
work, and a handoff that is easy to review and resume. Three capabilities serve that result:

- **Use:** invoke an app's declared semantic WebMCP tools in an authorized browser context, with visible effects and
  existing runtime permissions, policy and lifecycle controls.
- **Build:** help developers expose bounded, useful WebMCP tools in the app they are creating, with schemas, errors,
  lifecycle cleanup and tests. Code generation remains part of the AX Code runtime's coding workflow.
- **Verify and resume:** observe actual outcomes, turn failures into regressions, and include evidence in a useful recap.
  Desktop's own developer tools are the first internal example.

The current UI snapshot/click/fill adapter is a developer QA aid. It does not establish that every website supports
WebMCP, that every generated app has semantic domain tools, or that a successful invocation proves task completion.

## 2. Problems and evidence

The user reports that Desktop feels less polished than Orca, recap is missing or unreliable, and WebMCP should create
more value. These reports guide investigation; this task has not established a representative user study or competitor score.

Source and native exploration establish the following:

- The unpackaged Desktop can expose native, explicitly enabled UI WebMCP tools. Real Settings interactions have been
  performed through native WebMCP, with separate DOM and screenshot inspection.
- The first inventory visited all 15 Settings navigation pages. Confirmed defects include missing ARIA options/menu
  items in tool discovery, inaccessible controls past the first 100, missing focus behavior, unnamed numeric/shortcut
  inputs and icon actions, and a Hooks error boundary on an incomplete runtime response. Repairs remain uncommitted;
  final native validation of the latest candidate is pending.
- `/catch-up`, `/summary` and the **Catch me up** starter exist in `ChatInput-impl.tsx`, `magicPrompts.ts` and
  `draftStarters.ts`. They send model prompts. Their presence does not prove discoverability, correct contextual scope,
  successful generation, persistence or a ready-to-read recap when returning to a project.
- `SessionSummaryMeta` and `SessionSummaryLike` currently inspected contain additions/deletions/files/diffs. Those are
  change statistics, not a narrative recap. Model-context compaction is also a different feature.
- A first-class, evidence-linked return-to-project recap was not established by this inspection. The reported failure
  must be classified by testing the actual existing paths, rather than assuming they are absent or broken.
- The current UI lab uses a stub runtime. Unsupported stub responses, missing accounts and unavailable live models
  must be distinguished from product defects and from live-runtime qualification.

Local first-pass artifacts: `/tmp/ax-desktop-webmcp-bughunt-20261020/`. They are temporary local evidence, not public or
release evidence. The completion report must retain scrubbed reproductions and machine-readable coverage.

## 3. Users and essential journeys

Primary users are developers building/maintaining web apps and people supervising several coding projects. Start with
project/session orientation. Cross-project daily recap is a proposed extension; a user preference question is pending.

| Journey | Required result |
| --- | --- |
| Build and verify | Goal and acceptance → implementation → real app workflow → independently checked outcome → reviewable patch and evidence |
| Find and repair | Bounded exploration → minimal failing sequence → expected/observed result → fix → same sequence plus regressions |
| Return to work | Discover recap → understand changes, verified progress and blockers → inspect evidence → resume the correct work |
| Human-agent cooperation | Visible actions and scope → human intervention when needed → recovery without stale actions on a changed page |

Tool acknowledgements, schema validity, page navigation and screenshots prove different properties. None alone is a
complete task acceptance signal. Uncertain side effects must not be retried automatically.

## 4. P0: Reliable controls and recovery

- Inventory every Settings page and every rendered control page. Verify useful names and applicable disabled, current,
  selected and checked states. Expose the ARIA options and menu items the app actually uses.
- Preserve normal focus/input/blur behavior. Read-only shortcut capture fields can receive focus without becoming
  writable. Secrets, file inputs and privileged targets stay outside generic escape hatches.
- Malformed runtime data produces a local retryable error. An incomplete Hooks response cannot replace the Settings
  content with its error boundary; recovery from a valid response must be demonstrated.
- Improve practical findability and visual clarity: local shortcut action/chord search, result count, empty/clear states,
  meaningful field/row actions, readable hierarchy and clear dirty/default states.
- Audit all buttons structurally, exercise safe interactions and fixture-backed mutations, and record unexecuted external
  login, downloads, native dialogs and destructive operations. Do not claim those actions passed from a control inventory.

## 5. P0: Diagnose the recap complaint

Reproduce the starter, `/catch-up` and `/summary` in empty, draft, existing-session, switched-project, unavailable-model
and failed-request states. Check project/session identity, context, visible output, input recovery and restart behavior.
Classify failure as entrypoint discovery, generation, wrong context, weak content, missing evidence, stale output,
persistence or lack of a ready-to-read return surface. Do not relabel a prompt or diff count as a completed recap product.

## 6. P1: Evidence-linked project/session recap

The proposed recap must contain:

| Field | Acceptance |
| --- | --- |
| Goal and scope | Correct project/session and intended outcome |
| Progress and changes | Completed work and decisions, linked to messages, diffs or commits |
| Verified outcomes | Actual test/application observations; attempted, passed, failed and unverified remain distinct |
| Open work | Unresolved requests, failures, assumptions and unavailable evidence |
| Next action | Resume the correct session, review a diff, rerun a check or resolve a current request |
| Freshness | Timestamp and relevant project/session/revision identity; partial or stale content is explicit |

State model: `not_available`, `loading`, `ready`, `stale`, `partial`, `error`. Empty history, offline startup, cancellation,
restart and late async results require explicit behavior. Switching context cannot apply an earlier recap's result.
An available recap is readable without a new model call. Generation/refresh uses existing runtime provider, policy,
budget and cancellation rules. Automatic recurring generation or spend expansion is out of scope.

Canonical generation, durable execution facts, tool receipts and goal contracts remain runtime-owned. Desktop renders
bounded projections and navigation. If the published SDK/runtime lacks the required recap/evidence contract, paired
producer/consumer PRDs and ADRs plus a technical spec precede implementation. Do not invent a shipped endpoint.

## 7. P1: Reproducible WebMCP workflow evidence

Capture task intent, app/version identity, bounded redacted tool sequence, expected outcome, actual outcome and evidence
references. Stored DOM refs cannot be replayed across snapshots/documents; replay resolves current semantic intent and
rechecks scope. Include outcomes in recap. Site results/annotations remain untrusted; they cannot mint verification
authority. Desktop does not become a second workflow runtime or an analytics service.

## 8. Orca reference and visual quality

Local reference: Orca `bd7633f6` (2026-10-19), under `.internal/reference/orca`; read-only, with no upstream code copied.

- `SettingsFormControls.tsx` shows consistent labelled rows, descriptions and optional label IDs. Apply the principle
  within Desktop's own design system, including focus, units and useful disabled/error states.
- `ShortcutsPane.tsx` and `ShortcutFilterRail.tsx` provide local search/count/filter behavior. Desktop's initial useful
  improvement is shortcut search and unambiguous actions, not an unrelated visual redesign.
- Vendor command fixtures containing `recap` do not establish Orca's own project recap capability. Compare actual
  orientation and task completion, not matching feature strings.

Visual acceptance: readable hierarchy, aligned fields, manageable density, clear focus/disabled states, useful empty/error
feedback, no clipped controls or horizontal loss, and narrow-window usability. Inspect actual light/dark screenshots;
complement them with DOM/accessibility evidence. Static competitor scoring is not a user-value result.

## 9. Success and stopping criteria

Proposed primary measure: **user-accepted, independently verified outcomes per hour of human attention**. This is a
product hypothesis, not current telemetry or a measured improvement. Segment task types and user experience.

Supporting measures: time to a useful recap/next action, workflow completion, correction/review minutes, reopened defects,
false success claims, interruptions, recovery and model cost per accepted outcome. Establish baselines before targets.

The bounded bug hunt ends after the scoped matrix/regressions pass, actionable review findings are resolved or explicitly
dispositioned, and a second scoped exploration finds no further reproducible defects. This is not a claim of zero bugs,
universal site support, external-service qualification or complete Orca parity.

## 10. Research basis and limits

- [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp): proposed structured page tools and progressive
  enhancement; qualify availability/native protocol behavior against the pinned engine.
- [Chrome tool-design guidance](https://developer.chrome.com/docs/ai/webmcp/build-tools): start with user goals and test
  discovery, execution and interpretation. A catalog alone does not establish value.
- [WebMCP explainer](https://github.com/webmachinelearning/webmcp/blob/main/README.md): human cooperation, visibility and
  page control support shared, observable workflows.
- [Microsoft field experiments](https://www.microsoft.com/en-us/research/publication/the-effects-of-generative-ai-on-high-skilled-work-evidence-from-three-field-experiments-with-software-developers/):
  completion-assistant experiments observed higher completed-task throughput across 4,867 developers; that does not
  establish this product's benefit or the effect of current autonomous agents.
- [METR's 2026 update](https://metr.org/blog/2026-02-24-uplift-update/): developer/task selection and concurrent-agent time
  accounting limit current productivity estimates. Do not generalize an older slowdown finding to current products.
- [Anthropic's skill study](https://www.anthropic.com/research/AI-assistance-coding-skills): a small unfamiliar-library study
  found lower immediate comprehension with AI; retain user understanding and review without claiming a universal effect.
- [DORA 2025](https://dora.dev/research/2025/dora-report/): organizational strengths/weaknesses shape AI outcomes. Reliable
  feedback and delivery matter alongside capability.

## 11. Constraints

No replacement runtime, new credential custody, automatic approval/release, budget expansion, required BI service, relay
or mobile client. Preserve exact SDK and signed-runtime consumption, compatibility identity and release qualification.
New ownership/contract work follows PRD → paired ADR → technical spec → implementation. Existing accepted records remain intact.
