Independent, read-only assessment at HEAD `7811c298`. Competitors are assessed from the supplied facts snapshot; unknown capabilities receive no penalty. This is source verification, without rerunning apps or CI.

All abbreviated source paths below start at `desktop/packages/ui/src/`.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.5** | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | **9.2** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | **9.2** | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.32** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX’s counted, multi-select PR/check facets (`components/supervision/missionControl/MissionControlFilters.tsx:130`) and stale-preview Retry (`components/supervision/missionControl/MissionControlRow.tsx:201`) support selective intervention across many repositories, earning a narrow advantage over Orca’s strong dashboard. Browser calls waiting outside the visible session enter the global inbox (`components/supervision/NeedsYouPopover.tsx:64`), adding actionable supervision beyond Orca’s documented browser pane.

**Overview — AX vs opencode.** AX’s global request surface (`components/supervision/NeedsYouPopover.tsx:121`) reduces the session visits required by opencode’s documented per-session permission/question docks. Its session rows also expose browser context (`components/supervision/missionControl/MissionControlRow.tsx:253`), helping this persona understand parallel work without opening every session.

**Workspace — AX vs Orca.** AX now supports drag arrangement, keyboard movement, splits and pop-out (`components/sessionGrid/SessionGrid.tsx:134`, `:248`, `:303`, `:360`), removing the earlier fixed-layout disadvantage, while its page switcher exposes capacity and per-session revocation (`components/mcp/WebMcpPages.tsx:35`, `:60`). Orca remains compelling for flexible mixed-tool pane trees, but AX’s page-tool supervision and explicit pause/cancellation feedback (`components/layout/EmbeddedWebMcpBrowser.tsx:381`, `:594`) give AX a modest advantage for agent-driven web work.

**Workspace — AX vs opencode.** AX’s simultaneous session splits (`components/sessionGrid/SessionGrid.tsx:303`) better serve parallel inspection than opencode’s documented unsplit workspace. Its approval cards now bind the page definition to the runtime digest and offer the full description (`components/chat/WebMcpApprovalToolInfo.tsx:53`, `:96`), improving informed intervention rather than merely adding browser chrome.

**Review — AX vs Orca.** AX binds reviewed session content to blob identities and file modes before staging (`components/views/git/ReviewLanding.tsx:75`), and places jumpable browser steps, durations and definition identities beside landing (`components/views/git/ReviewLandingBrowserEvidence.tsx:152`, `:174`). Orca retains a meaningful advantage in documented inline three-way merge, preventing a larger AX lead.

**Review — AX vs opencode.** AX’s guarded Stage→Commit→Push path (`components/views/git/ReviewLanding.tsx:42`, `:192`) and adjustable directory tree (`components/views/ReviewFileRail.tsx:454`, `:567`) provide a stronger evidenced route from inspection to delivery. opencode retains useful turn undo/redo; undocumented landing capabilities are treated as unknown.

Compared with round 17, the improvement is modest: runtime approval previews are parsed (`lib/toolHelpers.ts:417`), unanswered approvals become visible (`components/mcp/WebMcpCallStrip.tsx:63`), and schema history gains property differences (`lib/webMcpPropertyDiff.ts:8`). These remain bounded: unanswered disappearance is not proof of timeout, and property diffs track selected top-level fields rather than every schema constraint.

**AX vs Orca: better** — **+0.39**, exceeding the 0.2 margin.  
**AX vs opencode: better** — **+2.42**.

