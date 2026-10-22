Independent, read-only judgment at **HEAD `96f74a34`**. Competitors use the supplied facts snapshot; unknown capabilities and inferred absences receive no penalty. Scores reflect source-supported workflows, not comparative usability trials; tests and native journeys were not rerun.

Source paths below are relative to `desktop/packages/ui/src/`.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.35** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.20** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.28** | **8.97** | **7.07** | **8.45** | **8.83** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX’s counted, multi-select PR/check facets and directly answerable permission cards give it a modest intervention advantage (`components/supervision/missionControl/MissionControlFilters.tsx:130`; `components/supervision/RequestActionCard.tsx:148`). Orca remains strong at ambient scanning; AX’s new session-bound waiting-page chip closes a concrete omission without demonstrating superior visual density (`components/supervision/missionControl/MissionControlRow.tsx:106`, `:283`).

**Overview — AX vs opencode.** AX consolidates requests and waiting pages in a global inbox, reducing navigation compared with opencode’s documented per-session docks (`components/supervision/NeedsYouPopover.tsx:121`, `:134`). Its activity previews retain explicit staleness, last-read age and Retry, making parallel work more understandable without opening every session (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:198`).

**Workspace — AX vs Orca.** Drag/dock arrangement, keyboard movement and pop-out substantially close Orca’s layout advantage (`components/sessionGrid/SessionGrid.tsx:143`, `:176`, `:356`). Orca retains more general mixed-tool pane trees, while AX limits the grid to four sessions and now provides each populated pane a session-specific page entry (`lib/supervision/sessionGrid.ts:53`; `components/sessionGrid/SessionGrid.tsx:289`).

**Workspace — AX vs opencode.** AX’s simultaneous sessions, each offering Chat/Changes/Files/Terminal, better support comparison than opencode’s documented unsplit workspace (`components/sessionGrid/SessionGrid.tsx:402`; `App.tsx:93`). Digest-matched page definitions also make WebMCP approvals inspectable, with an explicit warning when the matching definition is unavailable (`components/chat/WebMcpApprovalToolInfo.tsx:35`).

**Review — AX vs Orca.** AX binds reviewed-session staging credit to before/after content and file mode, then rechecks HEAD, branch and staged identities before committing (`components/views/git/ReviewLanding.tsx:77`, `:254`). Orca retains direct inline three-way merge; AX’s conflict flow delegates resolution to a session, and its landing checks remain preflight checks rather than atomic guarantees (`components/views/git/ConflictDialog.tsx:164`; `components/views/git/ReviewLanding.tsx:285`).

**Review — AX vs opencode.** Session/Last-turn landing and the adjustable tree rail provide a strong inspection-to-delivery path, while opencode retains useful documented turn undo/redo (`components/views/SessionChangesView.tsx:185`, `:420`; `components/views/ReviewFileRail.tsx:553`, `:562`). AX’s landing-side browser recap adds jumpable steps, durations and definition identity, explicitly reporting calls rather than test verification (`components/views/git/ReviewLandingBrowserEvidence.tsx:27`, `:141`).

Compared with round24/Codex, overview and workspace each gain **0.05**, review stays unchanged, and overall rises approximately **0.03**: the waiting-page chip and grid-preserving page access address actual navigation gaps (`components/supervision/missionControl/MissionControlRow.tsx:283`; `hooks/useWebMcpPages.ts:42`; `components/layout/MainLayout.tsx:534`).

**AX vs Orca: better** — weighted lead **+0.31**.  
**AX vs opencode: better** — weighted lead **+2.21**.

No flip list is required.

