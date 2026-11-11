# Second-round challenge: reconsider the fit after independent review

You are continuing the same advisory task, in a fresh tool-free consultation. Answer directly in English in at most
700 words. No tools, delegation, claims of execution or approval. Other reviewers are Claude Opus 5.5, Grok 4.7 and
Muse Wonder 1.0; each independently received review-input.md. The coordinator verified all three returned substantive
reviews. The following are paraphrases of their positions, not an assertion of correctness.

## Common recommendation and retained objection

All three prefer improving existing AX-native workflows first, with a separately gated external-agent adapter outside
Desktop; none recommends building a new durable multi-agent runtime inside Desktop. All three stress that source-level
features do not demonstrate real-provider concurrency or user value. All retain the objection that users may choose a
CLI's tools, memory and subscription rather than its underlying model; an AX-only pilot cannot settle that question.

Claude proposes lane identities, explicit created-versus-started status, a new-lane retry, and a Promote/verify/PR path.
Grok recommends a smaller assigned-review-lane workflow, visible child errors and verifying existing contracts before
new fields. Muse prioritizes supervision-to-evidence and suggests postponing broad CLI integration until real task
abandonment justifies it. Suggested numeric pilot thresholds differed (20-30 percent) and have no measured baseline.

## Coordinator's additional evidence and corrections

1. Desktop ALREADY has a raw terminal implementation: UI TerminalView.tsx, lib/terminalApi.ts, and web/server/lib/terminal/
   runtime.js (node-pty, shell startup, WebSocket input/output and process cleanup). A manual CLI can be run as a shell
   program. It is incorrect to call all CLI hosting a new forbidden runtime. The unevidenced capability is semantic
   registration as a supervised agent, bounded dispatch/result receipts, and independent process lifetime.
   The real alternative B is expanding this existing terminal into an agent-aware process supervisor, not writing PTY
   infrastructure from scratch. It still has ownership, recovery and verification costs.
2. Installed SDK 2.6.69 AssistantMessage already exposes providerID, modelID, agent, variant, path.cwd/root, time,
   errors and token counts. These establish the last observed execution when messages are loaded. They do NOT establish
   a not-yet-started child's effective model or its future model. Do not invent a new SDK DTO for fields already present.
3. SDK Config already has agents.model_pool; task.queue.created/updated events carry agent and model?: unknown.
   An editor or read model must validate unknowns and inspect existing config APIs before adding an endpoint.
   MultiRun metadata itself contains groupId, variantId, model, agent and worktree; it DOES NOT store model variant.
   The launcher passes variant at dispatch. Variant visibility needs another known source or an explicit unknown state.
4. Focused existing behavioral checks passed: 8 UI test files / 67 tests (MultiRun creation/fusion/grouping, child rows,
   ranking, verification, work-mode routing). This is fixture/mocked coverage, not live multi-agent or visual qualification.
5. Fusion still selects by title slug/runGroup/project; compare groups by metadata groupId. A same-project second launch
   with the same slug has a distinct metadata groupId yet can qualify for fusion by its title. A renamed representative
   can also lose parse eligibility. The current tests do not cover these metadata cases. This remains a source-backed
   risk pending a bounded mounted-component reproduction; do not claim a successful repro yet.
6. The work-mode compatibility fallback explicitly tells the main model to invoke council/arena. It might still invoke
   the real tool and all its policy checks. Therefore claiming it necessarily bypasses runtime policy is unsupported.
   The issue to investigate is whether the requested ensemble actually ran and how partial/unavailable members are shown.
7. The code intentionally gives a running tree precedence over a completed child's review/error, while retaining child
   state inline and in details. This avoids interrupting a parent that is handling the result. Do not simply change the
   canonical rollup or page the user for every failed helper. Evaluate a non-interrupting child-outcome indicator instead.
8. A received prompt is not proof execution started. startedRunCount describes the sends accepted by routeMessage;
   the first provider call, execution, verification and user acceptance remain distinct observations.
9. Arena already has implement mode with verification-first ranking in pinned runtime 7.30.16. Do not design a separate
   Desktop winner/promote engine or imply a new safe retry, merge or cancel behavior exists without contract inspection.
10. AX Agent current release readiness is not established. Its missing local checkout does not prove a missing release.

## Candidate decision to attack

Prioritize a task-first collaboration flow over the current Workspace/Portfolio/Review surfaces:
- Single AX worker remains default. Explain when to use Council (advice), Arena (alternatives) and delegated agents
  (different assignments); no always-on ensemble and no fourth top-level dashboard or mode invented for this review.
- First fix/qualify source-selection and launch truthfulness. Then expose last-observed versus configured model,
  assignment, worktree, child outcomes and next review action from existing data. Unavailable stays unavailable.
- Use an explicit assignment/handoff record tied to a goal and revision as a proposed producer contract ONLY for facts
  not already exposed. Independent review concerns are retained even when two models agree. Human integrates a verified
  branch through current tooling. Fusing assistant text never merges code or certifies a result.
- Evaluate bounded external READ-ONLY consultation first, using each CLI's structured headless output where supported.
  This very review demonstrated all three CLIs can return advice without repository tools. It is a feasibility receipt,
  not a production adapter. Validate identity/model, explicit context disclosure, timeout/cancel, member failure, output
  limits, provenance, spend and nonapproval before allowing external writers. Producer ownership needs an accepted ADR;
  AX Code stays the coding authority, AX Agent owns durable orchestration, Trust owns policy/credentials.
- Treat detached/background execution and remote machines as separate producer-owned lifecycle requirements, rather
  than smuggling them into terminal UI work. Pilot that need independently from model diversity.
- Compare current AX, improved AX and an external-harness workflow on matched tasks. Keep acceptance/defects, active
  human review/coordination minutes, cost and harness-specific abandonment; use a baseline before numeric thresholds.

Please answer:
1. What do you retract or narrow after these corrections?
2. What is the strongest failure mode of this candidate decision, including the case for earlier external-harness support?
3. What is the smallest useful first slice and its acceptance checks? Which suggestions must NOT be labeled Desktop-only?
4. Give a dissent entry the final decision must preserve and a measurable signal that would change the recommendation.

Consensus is not the objective; a testable fit and correct boundaries are.
