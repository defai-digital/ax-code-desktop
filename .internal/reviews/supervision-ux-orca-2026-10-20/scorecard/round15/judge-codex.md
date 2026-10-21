Independent, read-only judgment at **HEAD `92775899`**. Competitors use the supplied [verified facts snapshot](/Users/akiralam/code/ax-code-desktop/.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/competitor-facts.md:1); unknown capabilities receive no penalty. These are source-based UX scores, not measured usability results; I reran no journeys and exclude uncommitted runtime updates.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.4** | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | **9.2** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | **9.2** | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.28** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** Round 15 closes meaningful filtering and navigation gaps through [multi-select PR/checks facets](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlFilters.tsx:130), [cross-filter counts](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/missionControl.ts:165), and [PR search](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/ui/CommandPalette.tsx:684). The advantage remains bounded because [PR projection requires an already-known integration entry](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/hooks/useMissionControlPullRequests.ts:97).

**Overview — AX vs opencode.** AX’s [global actionable inbox, including waiting browser pages](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:121), reduces session-hopping compared with opencode’s documented per-session prompts. Its [stale-preview warning and direct Retry](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:193) also better support understanding unattended work.

**Workspace — AX vs Orca.** AX now supports [drag-to-swap/dock](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:143), [keyboard moves with following focus](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:175), and [pop-out ownership reconciliation](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/sessionGridPopout.ts:21), substantially closing round 14’s arrangement gap. Its [session-specific page switching/revoke](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:101) and [acknowledged cancellation](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:321) add supervision value beyond Orca’s browser pane, although the [four-session ceiling](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/sessionGrid.ts:53) limits simultaneous inspection.

**Workspace — AX vs opencode.** AX’s grid and per-session [Chat, Changes, Files and Terminal](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/App.tsx:93) are materially stronger for comparing agents than opencode’s documented unsplit layout. [Tab scoping and Shift+Enter split-open](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/ui/CommandPalette.tsx:829) further reduce switching effort, while opencode retains useful unread titlebar tabs.

**Review — AX vs Orca.** AX’s [session/turn landing](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/SessionChangesView.tsx:420), [content-and-mode review recognition](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:77), and [fresh commit preflight](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:252) earn a safe-delivery advantage. These remain read-before-write checks, while Orca’s inline three-way merge is more direct than AX’s [session-delegated conflict resolution](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ConflictDialog.tsx:156).

**Review — AX vs opencode.** AX’s [tree/list rail with adjustable width](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/ReviewFileRail.tsx:521) and [browser recap with exact-call navigation](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:143) strengthen review and handoff. opencode retains valuable turn undo/redo; its undocumented landing capabilities are not treated as absent.

Compared with round 14, the principal score improvement is workspace flexibility; review stays unchanged because optional runtime metadata receives no additional credit.

**AX vs Orca: better** — **+0.35**, exceeding the comparison’s 0.2 margin for this judge.

**AX vs opencode: better**

The conditional three-change flip list is unnecessary; this is one independent judgment, not collective acceptance.