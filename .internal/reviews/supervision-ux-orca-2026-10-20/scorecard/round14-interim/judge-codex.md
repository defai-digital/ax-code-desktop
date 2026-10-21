Read-only assessment at **HEAD `163272bf`**. Competitors use the supplied [facts snapshot](/Users/akiralam/code/ax-code-desktop/.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/competitor-facts.md:1); unknown capabilities receive no penalty. Scores reflect source inspection, not rerun usability tests or CI.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | 9.2 | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | 8.6 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | 9.2 | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.05** | **8.93** | **6.90** | **8.17** | **8.73** |

**Overview — AX versus Orca.** AX’s [actionable global inbox](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:124), [preview age and Retry](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:189), and [streaming-resistant Activity feed callback](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/ActivityButton.tsx:46) give it a narrow intervention advantage over Orca’s documented board and feed. Orca remains stronger in compound PR/MR navigation; AX’s [PR projection requires an already-known entry](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/hooks/useMissionControlPullRequests.ts:97).

**Overview — AX versus opencode.** The same global inbox substantially reduces navigation compared with opencode’s documented per-session permission/question docks. AX’s [activity previews, PR/check indicators and change counts](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:189) provide better evidence for understanding many sessions without opening each.

**Workspace — AX versus Orca.** AX adds useful supervision beyond Orca’s browser pane through [page-call durations, outcomes and results](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:88), [tool schemas](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:198), and [pause/resume controls](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:460). However, its [four fixed grid layouts](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:78) and [four-page default pool](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:116), which [rejects additional pages](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:564), leave Orca’s flexible pane trees ahead for this persona.

**Workspace — AX versus opencode.** AX’s [simultaneously embedded sessions](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:167) support comparison better than opencode’s documented unsplit workspace. Its [Try it outcomes distinguish completion, failure and uncertainty](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:317), adding practical web-app inspection value without assuming opencode lacks undocumented capabilities.

**Review — AX versus Orca.** AX now has [session/turn landing](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/SessionChangesView.tsx:419), [reviewed-content and file-mode checks](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:74), and a [collapsible, adjustable tree](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/ReviewFileRail.tsx:454), materially improving the frequent review-to-land task. The [browser recap](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:18) adds useful execution context, but remains call evidence rather than verification, while Orca retains its documented inline three-way merge advantage over AX’s [session handoff](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ConflictDialog.tsx:156).

**Review — AX versus opencode.** AX’s [fresh index/HEAD checks before committing and upstream-bound push](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:252) provide strong, demonstrated landing support. opencode’s documented turn undo/redo remains valuable; its unknown commit capabilities are not scored as absent.

Weights: overview **40%**, review **35%**, workspace **25%**.

**AX vs Orca: equal** — the 0.12 advantage falls below the controlling PRD’s 0.2 margin.  
**AX vs opencode: better**

Three smallest changes most likely to flip Orca:

1. Surface the existing [waiting state](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/hooks/useWebMcpPoolProjection.ts:78) in Needs you, overview and grid, with “Show page” routing.
2. Add a page switcher exposing owner, origin and access, wiring the existing [per-session revoke API](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:810).
3. Replace pool exhaustion’s [generic start failure](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:227) with named capacity and explicit unload/retry controls.

These round-14 interface completions were not found and receive no advance credit.

