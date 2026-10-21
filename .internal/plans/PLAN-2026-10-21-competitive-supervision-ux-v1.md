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
| Long-diff correctness and UI review | Kimi K3 256k (ax-code) | Long context for large multi-file diffs |
| Accessibility and keyboard review | Nemotron 3 Super (ax-code) | Independent perspective on ARIA patterns |
| Product analysis and design ideas (round 8 discussion) | Gemini 4 Argon (ax-code) | User-suggested for analysis and ideas |
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

Step 1 (before any WebMCP implementation): the plus/minus/multiply/divide design discussion in PRD section 4a, using the
WebMCP audit as shared evidence. Each participant answers independently in its own file, then a synthesis round; glm verifies
claims. The decision table turns supported items into CS-2x requirements. Step 2: implement the accepted items in work
packages with the usual gates.

WebMCP focus (CS-20 to CS-24), scoped from the audit report and confirmed against the WebMCP/recap PRD. The persona task
suite T1 to T6 is implemented as journey assertions with recorded action counts, so the definition of done (D2) can be
checked.

## Decisions

- 2026-10-21: the user asked to merge all branches and worktrees into main, clean up, commit and push before round 8 (approves the
  push that produces the three-platform CI receipts for D3).
