**AX now practically ties Orca and clearly beats opencode for this persona.** Independent, read-only assessment at HEAD `b52c0d96`; competitors use the supplied evidence snapshot. Unknown capabilities receive no penalty; I did not rerun applications or journeys.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | 9.2 | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | 8.8 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | 8.8 | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **8.96** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview 40%, review 35%, workspace 25%.

**Overview — AX vs Orca.** AX’s [global actionable inbox]( desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:124) and [confirmed batch decisions](desktop/packages/ui/src/components/supervision/PermissionBatchBar.tsx:38) make intervention efficient across repositories. The [header Activity entry](desktop/packages/ui/src/components/layout/Header.tsx:1759) closes an important discovery gap, although Orca retains stronger documented PR/MR triage.

**Overview — AX vs opencode.** AX combines [checks and change counts](desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:244) with [visibly stale previews](desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:173), whose cache [retries after failure](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:151). That supports understanding twenty sessions without opening each, substantially better than opencode’s documented recent-session list and per-session prompts.

**Workspace — AX vs Orca.** AX’s [one-to-four-session grid](desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:78) supports simultaneous supervision, but Orca’s pane trees and drag-to-split remain more adaptable. WebMCP’s [schema-driven tool testing](desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:69) and [revocation when paused](desktop/packages/electron/src/desktop-webmcp-browser.js:119) add meaningful web-app control beyond Orca’s browser pane.

**Workspace — AX vs opencode.** Each AX embedded session exposes its own [Chat, Changes, Files and Terminal](desktop/packages/ui/src/App.tsx:93). This better serves concurrent inspection than opencode’s documented unsplit layout, while its titlebar session tabs remain convenient for switching.

**Review — AX vs Orca.** AX now mounts [Branch landing](desktop/packages/ui/src/components/views/BranchChangesView.tsx:379), checks [staged blobs, HEAD and branch](desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:215), and [bypasses cached status](desktop/packages/ui/src/lib/gitApiHttp.ts:218), closing substantial handoff gaps. I score parity because [landing checks remain advisory](desktop/packages/ui/src/components/views/git/ReviewLandingChecks.tsx:31) and conflict handling still [delegates resolution to sessions](desktop/packages/ui/src/components/views/git/ConflictDialog.tsx:242), whereas Orca documents inline three-way merge.

**Review — AX vs opencode.** I prefer AX’s demonstrated guarded landing workflow, while crediting opencode’s tree navigation and turn undo/redo without assuming undocumented commit controls are absent. WebMCP also contributes useful operation review through [target, submit and redacted-text details](desktop/packages/ui/src/components/chat/PermissionCard.tsx:407).

One correction matters: the OS badge currently [sums root-session unseen counts](desktop/packages/ui/src/lib/tray/traySnapshot.ts:172), rather than Needs You. Windows confidence also remains incomplete: the record still reports [Last turn loading pending diagnosis](.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md:241).

**AX vs Orca: equal** — a 0.03 numerical lead does not establish practical superiority.  
**AX vs opencode: better**

Three smallest changes most likely to flip Orca:

1. Make the OS badge reflect actionable Needs You items, including child-session requests.
2. Project existing [PR/check status](desktop/packages/ui/src/components/views/git/PullRequestSection.tsx:380) into overview rows and filters.
3. Add collapsible directory grouping and resizing to the currently [flat review rail](desktop/packages/ui/src/components/views/ReviewFileRail.tsx:138).

