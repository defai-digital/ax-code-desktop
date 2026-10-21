## Round 9 judgment (independent, read-only; AX at HEAD)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.1** | 9.0 | 6.5 | 7.8 | 8.6 |
| Workspace / layout (25%) | **8.9** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes (35%) | **9.0** | 8.9 | 7.4 | 8.8 | 8.8 |

**Overview — vs Orca.** The titlebar Activity button carries the unread count and opens the chosen session from any surface (`ActivityButton.tsx:22`, mounted `Header.tsx:1759`), and a failed preview read keeps the old text, marked first so truncation cannot hide it, with a per-session backoff (`MissionControlRow.tsx:176-183`, `remoteActivityCache.ts:32,64-88,152-165`). Orca still triages better on card content and PR/MR facets, which AX rows and filters do not carry (no PR match in `MissionControlRow.tsx`).

**Overview — vs opencode.** opencode has only per-session permission docks, so twenty sessions cost twenty inspections; AX answers from a counted Needs You popover (`NeedsYouButton.tsx:25`) and an answerable inbox. AX's feed records this app's events only, but that still beats no cross-session channel.

**Workspace — vs Orca.** One to four live sessions with keyboard splitters (`SessionGrid.tsx:69`, `:184-192`) plus pane-scoped WebMCP "Try it" that grants nothing (`WebMcpToolPanel.tsx:188-189`) exceed a browser pane with no page-tool concept. Orca's arbitrary pane trees, drag-to-split and pane pop-out remain more adaptable; I found no AX equivalent.

**Workspace — vs opencode.** opencode documents no split panes, while AX runs four sessions each with chat, changes, files and terminal. opencode's unread titlebar tabs are the cheaper single-session switch.

**Review — vs Orca.** Branch scope now lands through the same reviewed-set preflight, bound to `indexBlobId`, `headOid` and branch read past the status cache (`BranchChangesView.tsx:379-394`, `ReviewLanding.tsx:185,218,236-238`), with runtime checks beside the action and a non-blocking warning (`ReviewLandingChecks.tsx:40`). Orca keeps inline 3-way merge and a file tree; AX has neither (no three-way match; flat filtered rail, `ReviewFileRail.tsx:97`), so this is a narrow lead, not a rout — a staged file whose blob id is unavailable fails closed as "changed since review" (`ReviewLanding.tsx:225-245`).

**Review — vs opencode.** AX offers verified landing, six scopes, re-anchored resolving threads and a target picker; opencode's review has no documented commit path. opencode's filterable tree and per-turn undo/redo stay locally nicer.

**Weighted overall (40/35/25):** AX **9.02** · Orca **8.97** · Claude **8.77** · Codex **8.25** · opencode **6.94**.

**AX vs Orca: equal** (0.05 is inside the judges' ~0.1 spread; the PRD's 0.2 lead is not met).
**AX vs opencode: better.**

Two corrections to the brief's claims: the dock badge sums unread notification counts per root session (`traySnapshot.ts:172`), not the Needs You count, so a pending approval without a new message may not badge; and Windows journey CI is still an un-re-run fix, not a result (`README.md:241-245`).

**Three smallest changes most likely to flip it**

1. Mount `ReviewLanding` in the session and turn scopes (`DiffView.tsx:2077` excludes them), reusing the existing preflight — the agent's own changes are the persona's most frequent review target and currently require a scope switch to land.
2. Make the dock/taskbar badge count needs-you sessions (pending approvals and questions), not only unread notifications (`traySnapshot.ts:172`) — one field plus a test, and it makes the already-claimed signal true.
3. Add a manual Retry and last-success age to a stale preview (`MissionControlRow.tsx:176-183`); backoff alone leaves a wedged read unfixable without leaving the surface.