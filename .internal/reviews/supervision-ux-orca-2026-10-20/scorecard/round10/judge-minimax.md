## Round 10 judgment (independent, read-only; AX at HEAD `acc31cad`)

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.2** | 9.05 | 6.4 | 7.8 | 8.6 |
| Workspace / layout (25%) | **8.85** | 9.0 | 7.0 | 8.2 | 8.8 |
| Review changes (35%) | **8.9** | 8.85 | 7.4 | 8.6 | 8.8 |

**Overview — vs Orca.** AX now closes Orca's last documented triage edge: PR state and CI checks reach rows (`MissionControlRow.tsx:245`), the peek (`:138`) and a PR filter that correctly excludes merged PRs from failing checks (`missionControl.ts:136-142`), on a bounded, staleness-aginging cache (`useMissionControlPullRequests.ts:74,128`). A stale preview is now self-repairing — manual Retry plus last-read age (`MissionControlRow.tsx:79-83,192-205`), with the OS badge counting unique pending decisions (`traySnapshot.ts:184-188`). Against that, the browser chip names a page for **only the one session currently attached** to the single project browser (`MissionControlRow.tsx:87-91,240-260`) — a real hole at 20 sessions; Orca still leads on the Cmd-J jump palette and dense kanban cards.

**Overview — vs opencode.** opencode has per-session permission docks and no cross-session channel (`competitor-facts.md:21-22`), so twenty sessions cost twenty inspections; AX answers from a counted inbox, cross-session activity feed with per-session backoff, and rows carrying verification, PR and child agents.

**Workspace — vs Orca.** AX's page-tool surface is genuinely beyond a browser pane: live calls with redacted arguments, outcome and failure reason in the pane (`WebMcpCallStrip.tsx:13-91`, mounted `EmbeddedWebMcpBrowser.tsx:432`) from the transcript it already holds, capped at 20 calls/60 messages (`webMcpCalls.ts:29,56`). But the deepest new value — eight failure codes and "Next step:" (`toolHelpers.ts:258-267,372-377`; `ToolPart-impl.tsx:221-222`) — is **dormant**: it needs the ADR-266 runtime, and the pinned runtime is v7.28.0 (`config/ax-code-runtime.json:3`), unpushed. Orca's drag-to-split, pane pop-out and per-worktree trees remain more adaptable; AX's grid offers only splitter drag (`GridSplitter.tsx:13-58`).

**Workspace — vs opencode.** Four sessions each with Chat/Changes/Files/Terminal beats an unsplit layout; opencode's unread titlebar tabs are the cheaper single-session switch.

**Review — vs Orca.** The browser-evidence button beside landing (`ReviewLandingBrowserEvidence.tsx:13-48`, mounted `ReviewLanding.tsx:372`) reports the latest turn's calls, correctly labelled as calls rather than test results — a real "did the agent actually try this" check Orca has no analogue for. AX's landing stays the most verified of the five (blob/HEAD/branch preflight, checks beside it, re-anchored resolving threads, target picker at `DiffCommentSummaryBar.tsx:231-234`), but it still cannot land from **This session or Last turn** (`DiffView.tsx:2077` restricts to all/working/staged) — the persona's most frequent target — and has neither inline three-way merge nor a rail tree.

**Review — vs opencode.** opencode has no documented commit path; AX's guarded landing, six scopes and resolving threads are decisive, though opencode's filterable tree and per-turn undo are locally nicer.

**Weighted (40/35/25):** AX **9.01** · Orca **8.97** · Claude **8.72** · Codex **8.23** · opencode **6.86**.

**AX vs Orca: equal** (+0.04, inside the ~0.1 judge spread; the PRD's 0.2 lead is unmet).
**AX vs opencode: better.**

**Two corrections to the brief.** F10 was *not* deferred — manual Retry and last-success age are already in HEAD with a regression test (`MissionControlRow.test.tsx:453-457`), so the README under-claims. W10a is code-complete but user-invisible until a signed ADR-266 runtime is pinned. Verification was source-level only: no shell was available in this session, so I ran no tests and cannot confirm the three-platform CI claim.

**Three smallest changes most likely to flip it to better**
1. Mount `ReviewLanding` for `session`/`turn` — drop the scope guard at `DiffView.tsx:2077`; the preflight already exists.
2. Collapsible directory grouping in the flat rail (`ReviewFileRail.tsx`) — parity with Orca's file tree.
3. Ship and pin the ADR-266 runtime so the eight failure reasons and "Next step:" actually render.