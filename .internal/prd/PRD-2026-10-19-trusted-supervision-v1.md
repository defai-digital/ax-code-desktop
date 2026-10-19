# Trusted supervision v1: show the runtime's goal state and finish the web-document hardening

Status: Accepted. Phase A is authorized for implementation by the user's 2026-10-19 instruction to plan, implement, test
and commit the Orca-gap work, and to record it as a PRD. Phases B and C are requirements only.
Related: PRD-2026-10-19-competitive-quality-v1; PRD-2026-10-19-supervision-v3; ADR-002; ADR-005; ADR-018.
Specifications: SPEC-2026-10-19-supervision-goal-v1 (Phase A item 1). Item 2 is covered by
SPEC-2026-10-19-renderer-security-baseline-v1.
Evidence: `../reviews/orca-gap-2026-10-19/DISCUSSION.md`.

## Problem

Two static scorings put Orca first (88 against 76.5 on the eight-criterion review; 8.6 against 7.6 on a six-dimension
review). Three independent reviewers (Grok, Muse, and the author) agree on the shape of the gap:

- Orca is an agent-neutral terminal host with a hosted relay and a phone client. Reproducing that would break the
  product boundary (AGENTS.md: no second coding runtime, no credential custody) and cannot be won.
- Orca supervises by inferring state from terminals and files. It has no goal concept. It also writes other vendors'
  trust files so their prompts never appear (`src/main/agent-trust-presets.ts`) and falls back to a 0600 plaintext
  token file when no OS keyring exists (`src/main/integration-credential-file.ts`).
- AX Code Desktop already consumes everything the runtime knows about a session except its durable goal. The pinned
  SDK 2.6.37 exposes `GET /session/{sessionID}/goal` and the `session.goal` event (objective, status, token and time
  budgets, plan path). Desktop has no caller for either, so Mission Control cannot show whether a long-running session
  is on track, blocked or out of budget.
- The web-served app document still allows `'unsafe-inline'` scripts (`web/server/lib/security/response-headers.js`),
  although the packaged document is hash-pinned (ADR-018).

The category Desktop can win is supervision a team can audit: what each run is for, whether it needs a person, what
authorised its actions, and proof that an update can be rolled back. This PRD starts with the two items that move that
category and need no runtime change.

## Goals

1. Every Mission Control row and Needs You entry shows the runtime's own goal state for the session, and a goal that
   cannot progress without a person is surfaced like any other request for attention.
2. The web-served app document stops allowing inline scripts it does not author.
3. The trust claims above become measurable and are published with their evidence, including what is not measured yet.

## Phase A: requirements (authorized)

1. **Session goal on supervision rows.** Desktop reads the runtime goal through the published SDK and the live
   `session.goal` event, and shows it on supervision rows.
   - Display: a short objective, the runtime status (`active`, `paused`, `complete`, `blocked`, `budget_limited`) and,
     when the runtime reports a budget, used and remaining tokens or time. A null goal shows nothing.
   - Attention: `blocked` and `budget_limited` goals on a session that is not running count as needing a person and
     appear in Needs You with their own reason. `paused` and `complete` are shown but do not raise attention.
   - Truthfulness: Desktop shows the runtime's status verbatim. It does not judge whether an objective was met, does not
     infer a status the runtime did not report and does not claim verification beyond what the runtime reports.
   - Load: no per-session request storm. The initial read is bounded in concurrency and limited to sessions that are
     displayed or not idle; later changes arrive through the event stream.
   - No new runtime endpoint, no new persisted store and no second state owner (ADR-005 stays deferred).
2. **Web-document script hashes.** The web server's app document drops `'unsafe-inline'` from `script-src` by listing
   the SHA-256 hash of every inline script it serves, reusing the packaged renderer's hashing. Preview and dashboard
   proxy responses keep their wider policy. The wildcard `connect-src` is not changed in this phase: web mode needs a
   documented audit of the origins it must reach first.
3. **Trust scorecard.** A dated report states each trust metric, its definition, how to reproduce it and the current
   number. Metrics that cannot be measured today are marked "not measured" with the work that would measure them.
   Orca figures use the 2026-10-19 reference clone only and are labelled as static readings, not runs.
4. **Accessibility and locales.** New controls have accessible names and keyboard access. Strings exist in every shipped
   locale, with no machine-generated catalog added.

## Phase B: requirements only (each needs its record before work)

| #   | Requirement                                                                                                  | Gate                                                 |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 5   | End-to-end journeys for approving, denying and a refused worktree creation (extends harness v2)              | Amend the e2e harness spec; coordinate with its owner |
| 6   | Fill `params` on every IPC command that still passes through, then split `main.js`                           | IPC contract spec v2                                 |
| 7   | Fixed 8-hour session script that records resident-set growth and listener counts; advisory in CI first        | Spec for the soak script                             |
| 8   | Automated accessible-name check for Mission Control and Needs You actions                                    | none                                                 |
| 9   | Move worktree creation to the runtime (competitive quality v1, item 8)                                       | AX Code ADR, then Desktop ADR                        |
| 10  | Narrow the web `connect-src` after an origin audit                                                           | Amend the renderer security baseline                 |

## Phase C: product decision

Read-only phone or web supervision of Needs You and goal state, using scoped AX Trust grants and a runtime read model.
Not before Phase A and items 5 to 9, because it adds reach but no trust.

## Non-goals

- A multi-vendor terminal host, per-vendor account switching, usage dollars, SSH worktrees, a hosted relay, computer-use
  sidecars. They duplicate runtime ownership or credential custody.
- Writing another tool's trust or permission files. Desktop approvals go through the runtime's permission identifiers.
- Judging goal completion in Desktop. The runtime owns goals, verification and their status.
- Any runtime change, new SDK pin, new telemetry destination, or change to the compatibility identity.

## Metrics

| Metric                                                                  | Today                                              | Target           |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ---------------- |
| Mission Control rows that show goal state when the runtime has a goal   | 0                                                  | all              |
| Blocked or budget-limited goals missing from Needs You                  | not applicable (goal state is not read)            | 0                |
| Desktop source paths that write another vendor's trust file             | none found in the 2026-10-19 reading              | 0, keep checked  |
| Inline-script allowances in the web-served app document                 | `'unsafe-inline'`                                  | none             |
| Public releases with signed install, upgrade and rollback receipts      | 7.27.3 has them                                    | every release    |
| Shipped locales with zero missing keys                                  | 14                                                 | 14               |
| Resident-set growth over the fixed 8-hour script                        | not measured                                       | measured, budget |

## Acceptance for Phase A

- Unit tests cover goal normalisation, the Needs You reason and its ranking, the bounded initial read, event handling
  including a null goal and an out-of-order event, and the CSP hash list for every inline script the web document serves.
- The end-to-end harness still passes with zero CSP violations against the web document.
- Locale, boundary, typecheck, lint, test and build checks pass.
- Commits are scoped by path and leave other sessions' work untouched.
