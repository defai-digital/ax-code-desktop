## Completion gate resolution

**Subagent task:** `ses_-e5ea3474183ffeDSW2uRCaKrb` ("Verify grid diff facts") — three attempts (initial, fresh retry, resume) each failed with `ProviderModelNotFoundError` before returning any text. No usable result is recoverable from that subagent; the tool-level failure is infrastructure, not a task error. No shell tool is exposed in this session either, so `git diff`/tests cannot be run here.

The missing result is unnecessary for the deliverable because every claim is anchored to lines I read directly with the read/grep tools, not to the subagent:

- `components/layout/MainLayout.tsx:414-415` — `isGridActive = activeMainTab === "session-grid"`; `:500` — `suspended={isGridActive}`, `rightContent={isGridActive ? null : splitRightContent}`; `:533` — `{!isGridActive && <ContextPanel />}`; `:547` — `<InspectorRail />` rendered unconditionally; `:507` — `ChatView` stays mounted under `invisible` (the overlay precedent).
- `lib/supervision/openBesideChat.ts:32` — `if (ui.activeMainTab !== "chat") useUIStore.setState({ activeMainTab: "chat" })`.
- `components/sessionGrid/SessionGrid.tsx:83`, `:93-94`, `:141-144`, `:147-154`; `lib/supervision/sessionGrid.ts:75`; `hooks/useSupervisionRows.ts:39` (rows ranked most urgent first).
- `lib/supervision/embeddedSession.ts`, `openSessionGrid.ts`, `stores/useUIStore-impl.ts:20-29/871-876/2490` — helper and persistence code, read in full.

The only diff-dependent detail (whether `ContextPanel` was previously unconditional) remains unconfirmed; Finding 1 was therefore stated as a mechanism claim that holds from current source alone: grid mode is the sole condition removing `ContextPanel` and the split-pane right content, and nothing in the grid path consults `mainTabGuard`.

## Final review result (unchanged)

1. **HIGH** `MainLayout.tsx:533,500` — grid entry unmounts ContextPanel realms and the Files editor; beside-chat drafts, terminals and unsaved editor text are lost, with no guard prompt. Fix: overlay the grid above a hidden, still-mounted chat/ContextPanel.
2. **HIGH** `SessionGrid.tsx:141-144` — option values are indices into a re-ranked `candidates` list; a state flip while the menu is open mounts a different session than clicked. Fix: identity-keyed values.
3. **MEDIUM** `MainLayout.tsx:547` + `openBesideChat.ts:32` — the inspector rail remains in grid mode and forces `activeMainTab` back to `chat`, abandoning the grid. Fix: hide the rail when `isGridActive`.
4. **MEDIUM** `sessionGrid.ts:75` + `SessionGrid.tsx:93-94` — hard 646px inner minimum clips panes off-screen below ~700px of content width (800px window with sidebars). Fix: derive the minimum from the measured extent.
5. **LOW** `SessionGrid.tsx:83,147-154` — layout shrink permanently drops panes; closing a pane leaves focus on `body`.

No crash, wrong-session, realm-cap, Windows-path or persistence defects were found in `restoreSessionGrid`, `resolveGridSession`, `sessionGridGeometry`, or the shared `embeddedSession` helper.
## Disposition (Claude)

1. HIGH, fixed: the grid hides the context panel and the split pane's right side instead of unmounting them, and the split layout
   keeps one element structure while suspended, so the chat is not rebuilt either (regression test
   `SplitPaneLayout.suspend.test.tsx`; mutation probe: restoring the old suspension makes it fail).
2. HIGH, fixed: picker options carry the session identity (session id and directory), not a list position.
3. MEDIUM, fixed: the inspector rail is hidden while the grid is the main view.
4. MEDIUM, fixed: in narrow windows panes share the visible width (never below 160 px) instead of overflowing; wide windows keep
   320 px panes. Geometry tests updated to the new rule.
5. LOW, deferred to round 8: shrinking the layout drops the extra panes' sessions, and Close leaves focus on the document body.
