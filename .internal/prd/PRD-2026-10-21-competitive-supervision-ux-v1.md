# Competitive supervision UX v1: Mission Control, workspace, review and WebMCP against Orca and opencode

Status: Accepted. The user asked on 2026-10-20 to improve Mission Control, workspace and review changes until AX Code Desktop
is a better experience than Orca and opencode, then test and commit. On 2026-10-21 the user approved the strategy below
("plan and implement as your suggestion"), directed that later rounds focus on WebMCP, and asked that a PRD under
`.internal/prd/` control the work.
Related and still authoritative: PRD-2026-10-15-supervision-workspace; PRD-2026-10-19-trusted-supervision-v1 (its
non-goals apply here); PRD-2026-10-20-reference-informed-supervision-v1 (RS-01 to RS-04 apply here);
PRD-2026-10-20-webmcp-outcomes-and-recap-v1 (the WebMCP rounds extend it); PRD-2026-10-11-embedded-native-webmcp-v1.
This record does not rewrite any of them. Execution and round tracking: `../plans/PLAN-2026-10-21-competitive-supervision-ux-v1.md`.
Evidence: `../reviews/supervision-ux-orca-2026-10-20/` (competitor facts, capability matrix, per-round judgments, reviews).
Revision 2026-10-21 (user direction, round 8 method): before WebMCP requirements are fixed, run a structured discussion with
several LLMs and sources on what WebMCP development experience is high value to users, organized by four operations:
plus (add high-value capability), minus (remove what is not good), multiply (decompose what is tangled into logical parts) and
divide (group scattered things to simplify). Section 4's round-8 candidates are inputs to that discussion, not its result.

## 1. Problem

Users reported that Mission Control, the workspace and review changes were not good, and asked us to learn from Orca.
Independent model judges (codex, deepseek-flash, MiniMax-M3) scored each round from source evidence, for a developer
supervising 5 to 20 parallel coding-agent sessions. Weights: overview 40 %, review 35 %, workspace 25 %.

| Round | Commit | AX (codex / deepseek / MiniMax) | Orca | opencode |
| --- | --- | --- | --- | --- |
| 3 | `41c65198` | 8.08 / 7.7 / 7.56 | 8.7 to 8.86 | 6.5 to 6.78 |
| 4 | `13a9161f` | 8.35 / 7.94 / 8.49 | 8.89 to 8.90 | 6.58 to 6.89 |
| 5 | `d9f1b29d` | 8.65 / 8.65 / 8.75 | 8.93 to 9.06 | 6.87 to 6.90 |
| 6 | `590da128` | not yet judged | | |

AX is judged better than opencode in every round and still behind Orca by about 0.3. Round 5 sub-scores put the remaining
gap mostly in the workspace (about 8.2 against 9.0: Orca has per-worktree pane trees with drag-to-split), then review
(about 8.6 against 8.8: three-way merge, landing flow, change navigation), then overview (about 8.9 against 9.0).

Static scoring has limits (PRD-2026-10-20-webmcp-outcomes-and-recap-v1, section 8): it is not a user-value result. The
judges read source and documentation; none ran Orca. This PRD therefore pairs judging with measured task journeys.

## 2. Strategy

1. Close the structural workspace gap: a session grid of up to four live sessions in one window.
2. Close the remaining review gaps: change-level navigation, the review-to-landing flow (round 6), Branch-scope staging.
3. Win where Orca cannot follow, because AX Code Desktop sits on a runtime it does not have: runtime verification and goal
   budget on the board, decisions on many pending requests at once, and agent use of web applications through WebMCP.
4. From round 8, focus on the WebMCP experience (section 5), which the user identified as the decisive advantage.

## 3. Definition of done

All of the following, in one round, on the committed tree:

- D1. All three judges rate AX better than Orca with a weighted margin of at least 0.2 (the judges' spread is about 0.1),
  and better than opencode. Judges get the same brief shape as earlier rounds, the competitor facts, and the evidence in the
  repository; unknown competitor capabilities are not counted against them.
- D2. The persona task suite (section 6) passes in native WebMCP journeys, with step counts recorded as evidence.
- D3. CI receipts for the supervision journeys on macOS, Windows and Ubuntu (job `supervision-journeys`). This needs the
  commits on the remote; pushing requires the user's explicit approval.
- D4. Every round gate in section 7 holds.

Until D1 to D3 hold, reports say "not yet better than Orca" with the latest numbers.

## 4. Requirements

### Shipped (record)

| ID | Round | Requirement | Commit |
| --- | --- | --- | --- |
| CS-01 | 3 | Compound overview filters (project multi-select, Has changes, chips, Clear all); child count; activity preview in every density | `41c65198` |
| CS-02 | 3 | Branch scope against a selectable base's merge-base; comment target picker; session in a separate window | `41c65198` |
| CS-03 | 4 | Persisted review threads (re-anchor, resolve, reopen, re-send); viewed marks keyed to blob identities; open a session beside the chat; updated-since-visit facet and Mark as unread | `13a9161f` |
| CS-04 | 5 | Child agents as rows; cross-session Activity feed; bounded previews for never-opened sessions; beside session with Chat/Changes; inline thread markers; both-sided session marks with fallback warning; remembered Branch base | `d9f1b29d` |
| CS-05 | 6 | Beside session Files and Terminal tabs; progressive Stage, Commit and Push with fresh-state checks; Windows/CRLF/terminal fixes; three-platform journey CI job | `590da128` |
| CS-10 to CS-13 | 7 | Change navigation, session grid, runtime verification evidence, batch permission decisions | `4dc7d52a` |
| CS-25 to CS-32 | 8 | WebMCP: honest browser lifecycle, truthful failures, informative approvals, page tools with "Try it", named transcript rows, supervision integration, entry flow, naming | round 8 commit |

### Round 7 (authorized)

| ID | Priority | Requirement and acceptance |
| --- | --- | --- |
| CS-10 | P0 | Change-level navigation. F7 and Shift+F7 move between change hunks across files in rail order without wrapping, in every review scope and both layouts; never while typing; a polite live region names "Change n of m in path"; registered in the shortcut registry so users can rebind it. Locale loading stays fail-closed: new strings are translated, never filled from English. |
| CS-11 | P0 | Session grid. One to four live sessions side by side in one window (layouts 1, 2, 3, 2x2), each the existing embedded session with its own Chat/Changes/Files/Terminal; keyboard-operable splitters with a minimum pane width; Focus, Replace and Close per pane; opened from Mission Control multi-select and the command palette; restored per window with missing sessions shown as an explained empty slot. Windows paths work. The native journey opens two fixture sessions as a grid and asserts both composers. |
| CS-12 | P0 | Runtime verification evidence. Where the runtime records verification for a session, the row shows it verbatim (passed/failed/pending/none with counts) with a "Checks failing" facet, and goal budget left when a budget exists. Desktop never infers verification from prose, a green check or idle state (RS-02; trusted-supervision non-goal). If the pinned runtime has no per-session source, the deliverable is the research note and a proposed runtime contract, not invented data. |
| CS-13 | P0 | Batch decisions on pending permission requests. Two or more pending requests for the same permission get one group decision: allow once or deny, armed by a first click that names the count and sent by a second click. Questions are never batched. No standing grant, no rule for future requests, no "always": expanding permissions needs an AX Trust policy and explicit approval. The individual cards stay visible. |
| CS-14 | P1 | Branch-scope staging for files whose Branch diff includes uncommitted changes, through the existing stage API. |
| CS-15 | P2 | Pull-request state on Mission Control rows when the existing PR integration already knows it. |

### Round 8 and later: WebMCP focus

Derived from the WebMCP audit (`../reviews/supervision-ux-orca-2026-10-20/` round 8 folder, to be added), the WebMCP/recap
PRD and the round-8 design discussion (section 4a). Candidate requirements, each confirmed by the audit and the discussion
before work:

| ID | Requirement |
| --- | --- |
| CS-20 | The project browser restores the last page instead of about:blank, and agent access cannot report "on" while the runtime rejects the page; every failure names the cause and offers the fixing action. |
| CS-21 | A live per-page tool panel: which tools the page registers, what the agent called, with arguments and results, and the decision that allowed it. |
| CS-22 | Tool discovery: pages and projects that expose WebMCP tools are visible before the user asks the agent. |
| CS-23 | WebMCP activity joins supervision: a session using the browser shows it on its Mission Control row and in the Activity feed. |
| CS-24 | Model robustness stays measured: the WebMCP probe passes with deepseek-flash and one other model on the pinned runtime. |

### Round 8 requirements (accepted 2026-10-21 from the 4a discussion)

Decision record: `../reviews/supervision-ux-orca-2026-10-20/round8-webmcp-design/DECISION.md` (answers, Kimi K3 synthesis, glm-5.3
verification). These refine CS-20 to CS-23; CS-24 becomes runtime proposal R3. All are Desktop-only.

| ID | Priority | Requirement and acceptance |
| --- | --- | --- |
| CS-25 | P0 | Honest browser lifecycle. Reopening restores the last page URL per (normalized project path, session) with agent access off; access is never shown "on" while the runtime rejects the page; a dialog or hidden pane pauses access with a visible "paused" state and a resume action instead of silently disconnecting; each state (no page, page loaded, access offered, granted, paused, disconnected) shows exactly one next action. Restoring a page never restores authority: grants and element references from before are unusable, and nothing pending is executed on resume. |
| CS-26 | P0 | Truthful copy and actionable failures. Remove "The agent cannot open pages itself" (false since runtime 7.25.8) and the "Update the bundled runtime" message when the runtime simply did not report compatibility (show "unknown"). Failures name the native cause (for example an unsafe port) with one fix action that never expands permissions; the same sentence appears in the pane, tooltip and Services menu. A page with no tools is not shown in the success tone and says the agent can still read and act on the page. |
| CS-27 | P0 | Informative approvals. WebMCP approval cards show origin, operation, and for act requests the target element, submit flag and redacted text the runtime already sends; the title names the page tool or operation instead of "webmcp"; "Always allow" is not offered when the request carries no named scope (Allow once and Deny remain). |
| CS-28 | P1 | Live tool panel. The page's registered tools (name, description, input schema) are visible with agent access off, from one panel reachable from every WebMCP entry point; "Try it" lets the user invoke a tool as themselves with a form from the schema, showing the result, and creates no agent grant and no session tool part. |
| CS-29 | P1 | Transcript rows for desktop_webmcp calls name the page tool or operation and make failure visible when collapsed. |
| CS-30 | P1 | A session using the project browser shows the page origin on its Mission Control row and the Activity feed records when it starts and stops, from data Desktop already has. |
| CS-31 | P2 | Entry flow: one primary enable action from a draft; the address bar's Go works independently of enabling. |
| CS-32 | P2 | Naming: the project browser, the Chrome-bridge allowlist and the MCP server named `webmcp` have distinct titles; the bridge section shows only when that server is connected. |

Runtime contract proposals (need AX Code ADRs; no Desktop dependency until accepted): R1 forward invoke arguments and an always-scope
in permission metadata; R2 stable structured failure reason codes; R3 model guard rails (invoke templates in list results, schema
validation before invoke, `nextAction` on errors); R4 per-call WebMCP events for the activity feed and recap; R5 coordinated request
lifecycle across reconnects; R6 reject a provider enrollment whose session does not belong to the enrolling directory (from the
package A security review).

### 4a. Round 8 design discussion: plus, minus, multiply, divide

Question: what does a developer who builds or uses web applications with WebMCP value most, and how should AX Code Desktop's
WebMCP experience change to deliver it?

- Participants: codex, grok 4.7, MiniMax-M3 (UI/UX), Gemini 3.8 Flash (visual comparison), Kimi K3 (synthesis) and glm-5.3
  (verification of others' claims); Gemini 4 Argon contributed one answer before it was withdrawn for lack of credit. Each
  answering independently first; then one synthesis round where each critiques the merged list.
- Sources they must use and cite: the WebMCP audit report and screenshots; the current source (path:line); the WebMCP specs
  and explainer and browser documentation (online, official sources only); the accepted WebMCP PRDs and ADRs; earlier user
  feedback (about:blank start, "0 tools on this page", unreadable failures, weaker models misusing tools); competitor facts.
- Output per participant, in four lists:
  - Plus (+): capabilities to add, with the user value and the evidence.
  - Minus (-): things to remove or stop showing because they confuse, mislead or duplicate.
  - Multiply (x): tangled flows or controls to decompose into clear, logical steps or states.
  - Divide (/): scattered controls, settings or states to group into one simpler place.
  Each item names the user task it improves (T6 and new WebMCP tasks), its cost (Desktop only, or needs AX Code runtime), and
  a measurable acceptance check.
- Decision: items that at least two participants support with evidence, and that glm's verification does not refute, become
  CS-2x requirements with acceptance checks; the rest are recorded as rejected or deferred with the reason. The discussion and
  decision are kept under `../reviews/supervision-ux-orca-2026-10-20/round8-webmcp-design/`.

## 5. Constraints

- Product boundaries in AGENTS.md: no second runtime, no credential storage, runtime-owned verification and goals.
- No automatic approvals, standing grants or permission expansion without an AX Trust policy and the user's approval.
- macOS, Windows and Ubuntu are supported targets: directory identity goes through `normalizeProjectPath`, line endings are
  unified where text is matched, no platform-only shortcut is the only way to an action.
- All 14 locales complete; new strings translated; identical spellings only through `desktop/shared/shared-spelling.json`.
- Stores do not import other stores; tests do not read source as text; the UI package uses `src/test/dom.tsx`.
- Commits by explicit path; no push, release or publication without the user's explicit approval.

## 6. Persona task suite

Measured in native WebMCP journeys against the stub runtime and real Git fixtures. Each task records the number of user
actions and whether it completed; the first run sets the baseline.

| Task | Completed when |
| --- | --- |
| T1 Notice and answer | Three pending permission requests across two projects are answered from Needs You without opening a session. |
| T2 Understand without opening | For each of three sessions, the board shows its state, latest activity and change counts. |
| T3 Compare two agents | Two sessions are visible with their own composer and their own changes at the same time. |
| T4 Review and land | Files are viewed, staged, committed and pushed with the landing action (push against a local bare remote). |
| T5 Return after leaving | Sessions updated since the last visit are found with the facet and the Activity feed. |
| T6 Use a web app through WebMCP (round 8) | The agent lists and invokes a page tool, and the user sees the call and its result. |

## 7. Round gates (control)

Every round, before its commit:

1. Scope: each change maps to a requirement ID in section 4; anything else is deferred or recorded here first.
2. Authorship and review: an implementer per package in its own worktree, and a review by a different model; HIGH and
   P1/P2 findings fixed with regression tests or explicitly dispositioned in the round record.
3. Mutation probe for each new guard.
4. Gates: typecheck, lint, boundaries, release contract, locales, full UI/web/Electron/shared tests, actionlint when
   workflows change, and the native WebMCP journeys (supervision-workspace, portfolio-identity, project-home).
5. Record: the round section in the scorecard README with gates and review dispositions, and the plan's round table.
6. After the commit, three-judge scoring of the committed tree; the result goes into section 1 and the plan.

## 8. Non-goals

Reproducing Orca's terminal-host model, hosted relay, vendor trust-file writes or plaintext token fallback; judging goal
completion in Desktop; changing the runtime, the SDK pin or the compatibility identity from this PRD.
