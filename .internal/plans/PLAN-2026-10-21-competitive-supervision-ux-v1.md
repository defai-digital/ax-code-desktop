# Plan: competitive supervision UX v1

Controls execution of `../prd/PRD-2026-10-21-competitive-supervision-ux-v1.md`. Each package names its requirement ID,
author, reviewer and status. A package that does not map to a requirement is not started.

## Model allocation

| Role | Model | Reason |
| --- | --- | --- |
| Architecture-heavy implementation, cross-platform audit, judging | codex | Most accurate reviewer and implementer in earlier rounds |
| Feature implementation in a separate worktree | grok 4.7 (Grok Build CLI) | Good long implementations; slower reviews |
| Correctness and security reviews, judging | deepseek-flash (ax-code) | Fast, found real HIGH findings in rounds 5 and 6 |
| UI/UX review and judging | MiniMax-M3 (ax-code) | Must cite path:line; unique claims need confirmation |
| Translations into 13 locales | glm-5.3-flash (ax-code) | Returns {key: {locale: text}} JSON; placeholders checked |
| Long-diff review; synthesis of multi-model discussions | Kimi K3 256k (ax-code) | Long context: reads all answers plus evidence at once (rate-limited on 2026-10-21, available again later that day) |
| Accessibility and keyboard review | Nemotron 3 Super (ax-code) | Independent perspective on ARIA patterns |
| (not available) | Gemini 4 Argon (ax-code) | Removed 2026-10-21 at the user's direction (no credit). One round-8 answer written before that is kept. |
| Visual ideas and screenshot comparison (round 8) | Gemini 3.8 Flash (ax-code) | User-suggested for visual comparison |
| Translations into 13 locales | Mistral Medium 3.5 (ax-code) | Multilingual strength; placeholders checked mechanically |
| Integration, fixes, gates, journeys, records | Claude | Owns the main tree and commits |

Use a model only where its strength applies; not every model is used every round.

## Round 7

| Package | Requirement | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| H7 change navigation | CS-10 | grok | deepseek-flash | merged in the working tree; locale-loader change dropped (CS-10 fail-closed); review: 1 HIGH (registry not pane-scoped), 4 MEDIUM, 4 LOW; all fixed by grok (pane-scoped registry, directory in keys, anchor re-resolution, shared parse cache, highlight upkeep, boundary announcements) |
| S7 session grid | CS-11 | codex | deepseek-flash (correctness/UI; Kimi K3 hit an upstream rate limit), Nemotron (a11y) | done. Locale fallback not merged; review: 2 HIGH and 2 MEDIUM fixed, 1 LOW deferred to round 8; accessibility review needed no change |
| V7 verification evidence | CS-12 | grok | codex | done. Source: runtime `session.risk` envelopes, verbatim; codex review: 3 P2 fixed (stale marking and retry, real request cancellation, accessible status) |
| N7 batch permission decisions | CS-13 | Claude | deepseek-flash | done in the working tree. Review: no HIGH; fixed all (risky and must-decide requests never batched, grouping by permission and risk class, every scope shown when armed, set signature by session and request checked at send time, 20 s bound per reply with an accepted/unconfirmed summary, requests already being answered left out, inbox order, live region, one-session copy). Mutation probe on the swapped-set guard. |
| B7 Branch-scope staging | CS-14 | | | deferred to round 8 |
| P7 PR state on rows | CS-15 | | | deferred |
| W8 WebMCP audit (input to round 8) | CS-20 to CS-24 | Claude subagent | | done: `round8-webmcp-design/AUDIT-2026-10-21-webmcp-ux.md` |

Round 7 commit criteria: PRD section 7 gates; judging afterwards.

## Round 8 and later

Discussion done 2026-10-21 (decision record in `round8-webmcp-design/DECISION.md`). Packages, by file ownership (disjoint locale
key prefixes; merge order A, B, C):

| Package | Requirements | Author | Reviewer | Files | Status |
| --- | --- | --- | --- | --- | --- |
| A browser state and failures | CS-25, CS-26, CS-31 | codex | Kimi K3 (long diff), deepseek-flash (security of persistence) | `EmbeddedWebMcpBrowser.tsx`, `useWebMcpBrowser.ts`, `webMcpSummary.ts`, the browser store, Electron `desktop-webmcp-browser.js`; `webmcp.*` keys | done; security review dispositioned (R6 to runtime); Kimi review: 3 MEDIUM fixed by codex with tests and probes |
| B approvals and transcript | CS-27, CS-29 | grok | deepseek-flash | `PermissionCard.tsx`, `PermissionCardTools.ts`, `ToolPart-impl.tsx`, `toolHelpers.ts`; `chat.permissionCard.*` keys | done; review findings fixed, Chrome-bridge regression reverted |
| C tool panel and supervision | CS-28, CS-30, CS-32 | Claude | codex | new tool panel, `WebMcpBrowserTools.tsx`, `WebMcpHeaderButton.tsx`, `WebMcpAllowlistSection.tsx`, supervision projections; `webmcp.tools.*` keys | done: CS-30 (row chip, feed events), CS-28 (bounded tool catalog from Electron, schema form, "Try it" as the user with no grant), CS-32 ("Chrome bridge site approvals", shown only while that bridge is connected); done |
| Deferred LOW from round 7 | grid layout shrink, focus after Close | Claude | | `SessionGrid.tsx` | done with tests |

Step 1 (before any WebMCP implementation): the plus/minus/multiply/divide design discussion in PRD section 4a, using the
WebMCP audit as shared evidence. Each participant answers independently in its own file, then a synthesis round; glm verifies
claims. The decision table turns supported items into CS-2x requirements. Step 2: implement the accepted items in work
packages with the usual gates.

WebMCP focus (CS-20 to CS-24), scoped from the audit report and confirmed against the WebMCP/recap PRD. The persona task
suite T1 to T6 is implemented as journey assertions with recorded action counts, so the definition of done (D2) can be
checked.

## Round 9 (WebMCP continued, and the definition-of-done evidence)

Started 2026-10-21 at the user's direction to continue to the next round while round 8 finishes.

| Package | Requirement | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| R-runtime: WebMCP runtime contract | R1 (invoke arguments and always-scope in permission metadata), R2 (stable failure reason codes), R3 (guard rails for weaker models: invoke templates, schema validation before invoke, `nextAction` on errors), R6 (reject enrollment whose session is not in the directory) | next free implementer, in `~/code/ax-code` on a new branch | different model | needs an AX Code ADR first (AGENTS.md governance); then a pinned runtime release before Desktop depends on it |
| T-suite: persona task journeys | D2: T1 to T6 as native journey assertions with recorded user-action counts | codex after the package A fixes | deepseek-flash | not started |
| W-ci: Windows supervision journeys | D3: the Windows job ran past its limit on the first run | Claude | | fixed in round 8 (path matching, process-tree teardown); needs a CI run on the remote |
| J9: judging | rounds 6 to 8 combined, three judges | codex, deepseek-flash, MiniMax-M3 | | done: 8.85/8.98/8.92 vs Orca 8.93/9.01/9.07 (worse, equal, worse) |
| L9: landing everywhere | CS-14 Branch-scope staging and landing; commit bound to staged blob identities and HEAD; the session's runtime checks beside the landing action | codex | deepseek-flash | done; review findings fixed |
| N9: signals outside the board | Activity unread in the titlebar (the dock badge already showed Needs You); stale activity previews with backoff retry | Claude | codex | done; review findings fixed |
| M9: three-way merge | inline conflict resolution | later | | not started |

## Round 10

Targets from the round 9 judgments (codex 8.96 vs 8.93, deepseek 9.02 vs 8.97, MiniMax 9.03 vs 9.01: all equal, AX slightly ahead).
Correction: rounds 9 records said the OS badge already showed the Needs You count; it counted unseen notifications
(`lib/tray/traySnapshot.ts`). Round 10 changes it.

| Package | Requirement | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
WebMCP first (user direction 2026-10-21: "WebMCP is the winning chance"). Orca has a browser pane with no page-tool concept, so
round 10 makes WebMCP visible where the persona supervises and lands work:

| Package | Requirement | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| W10a: runtime contract in Desktop | read ADR-266's optional fields as they arrive: invoke `inputPreview`, failure `reason` and `nextAction`; older runtimes keep today's behavior | Claude | Kimi K3 | done |
| W10b: live call strip (CS-21) | in the project browser pane, the session's recent page-tool calls (tool, redacted arguments, outcome, failure reason) | Claude | Kimi K3 | done |
| W10c: browser evidence beside landing | next to Stage, Commit and Push, the latest turn's page-tool calls and failures, opening the browser; labelled as calls, not test results | Claude | Kimi K3 | done |
| R-runtime (ADR-266) | runtime contract on branch `feat/webmcp-desktop-contract-v1` in AX Code | grok | deepseek-flash | implemented; review: no blocking issue, three MEDIUM fixed on the branch; not yet in a signed runtime |

| Package | Requirement | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| B10: actionable badge | the OS dock/taskbar badge counts pending decisions (permissions and questions, child sessions included) | Claude | Kimi K3 | done |
| P10: PR and check state on the board | CS-15: PR state and CI checks the existing PR integration knows, on Mission Control rows and as a filter | codex | deepseek-flash | done; review: four MEDIUM/LOW fixed with mutation probes |
| S10: land from session scopes | ReviewLanding in This session and Last turn, reusing the preflight | Claude | codex | moved to round 11 |
| F10: stale preview recovery | manual Retry and last-success age on stale activity previews | Claude | codex | moved to round 11 |
| G10: free grid arrangement | drag a slot to split or reorder, pop a slot out into its own window | grok after the runtime package | codex | not started |
| M10: three-way merge | inline conflict resolution | later | | candidate |
| R10: review rail tree | collapsible directory grouping in the review rail | | | candidate |

## Decisions

- 2026-10-21: the user asked to merge all branches and worktrees into main, clean up, commit and push before round 8 (approves the
  push that produces the three-platform CI receipts for D3).
- 2026-10-21: the user approved pushing each round to `origin/main` after its gates pass, without asking again (round 9 onward).
  This covers commits of this plan's rounds only; releases and publication still need explicit approval under ADR-012.
