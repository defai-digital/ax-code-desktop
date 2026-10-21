# Round 14 R14a review: sessions you can see and control (deepseek-flash, read-only)

Final answer — review complete, no further tool work possible in this environment.

**Outcome: no blocking issue.** The change satisfies the core R14a invariants I could verify from source:

- the page switcher and revoke act on the clicked page's own `directory`/`sessionID` (UI: `desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:19-34`; native: `desktop/packages/electron/src/desktop-webmcp-browser.js:877-899`), never the shown page;
- equal session IDs in different projects stay distinct because every key is `projectKey(directory) + "\0" + sessionID` (`desktop/shared/webmcp-view-key.mjs:19-21`);
- LRU eviction only takes ready, hidden, idle, same-window views and excludes waiting/active/loading/enrolling pages (`desktop-webmcp-browser.js:131-137,621-627`);
- the retained address is process-memory only and is not exposed by `list` (`:158-175`); reopening rebuilds a fresh entry with no connection and reports access off;
- the trust summary is display-only and its scope claims match enforcement;
- the titlebar waiting count deduplicates a waiting page against a needs-human row via the same key function (`desktop/packages/ui/src/components/supervision/NeedsYouButton.tsx:28-31`).

Remaining findings, unchanged (one High, two Medium, five Low): the Windows path-identity mismatch in `useWebMcpPages.ts:22-28` (project label, session title and `projectId` degrade on Windows; no mis-targeted action); unbounded dormant records plus per-record owner listeners in `desktop-webmcp-browser.js:123-130,138-157`; and the cross-window `pool-full` dead end whose recovery text is not actionable (`WebMcpPages.tsx:60-64`). Details and the Low items are in the review above.

Evidence gaps I could not close: `bash` is still denied in read-only mode (`monitor` and the verification wrapper cannot surface stdout), so I never saw `git diff HEAD`, the untracked-file list, or any executed check. No test, typecheck, lint or native-journey result is confirmed by me; the handoff's verification table remains unverified, and Windows/Linux execution is still unclaimed.
## Detail


## High

**1. On Windows the page identity never resolves, so the switcher, trust summary and per-session buttons show the raw session ID and path instead of the session title and project label.**
`desktop/packages/ui/src/hooks/useWebMcpPages.ts:22-28` matches with a bare `normalizeProjectPath(...) === view.directory`, but `view.directory` comes from the native `projectKey()` (`desktop/shared/webmcp-view-key.mjs:3-6`), which lower-cases the whole path on Windows/UNC. `normalizeProjectPath` only upper-cases the drive letter (`desktop/packages/ui/src/lib/projectResolution.ts:8`), so `C:/Users/X` never equals `c:/users/x`. Consequences on Windows only:
- `project` falls back to the raw path (`useWebMcpPages.ts:33`) — the project label is lost.
- `title` falls back to `view.sessionID` (`:34`), so the switcher (`WebMcpPages.tsx:68`) and trust summary (`:129`) name the session by ID.
- `projectId` is `undefined`, so `showWebMcpPage` calls `openSupervisedSession({ projectId: undefined })` (`:44-46`).
This does not mis-target any action — navigation and revoke use the view's own `directory`/`sessionID`, and the store key is native-computed — but it breaks the WX-15 item-4 requirement to name each page's project and session on Windows. Fix: compare with `getProjectPathIdentityKey`/`toComparableProjectPath` (`projectResolution.ts:16-22`) instead of strict `normalizeProjectPath` equality.

## Medium

**2. Dormant (unloaded) records are unbounded, and each one adds a listener to the window and to the renderer.**
`desktop/packages/electron/src/desktop-webmcp-browser.js:123-130,138-157` keeps every evicted page in the `unloaded` Map until the owner closes, the project is cleared, or the pool shuts down (`:860`, `:1140-1145`), with three listeners per record (`:153-155`). There is no cap and no oldest-first eviction of dormant records. A window that evicts ~10 distinct pages will exceed Node's default 10 listeners on the `BrowserWindow` (`owner.on("closed")` plus its live-view listeners) and emit `MaxListenersExceededWarning`; the retained `sender` reference also keeps the WebContents object alive. The W7 gate only switches between two sessions (`project-browser-sessions.mjs`), so the "bounded memory" claim is not actually exercised for this map. Suggest capping dormant records (e.g. 8-16, evict oldest `lastUsed`) and using one shared listener per owner instead of per record.

**3. A second window can be permanently blocked by `pool-full` with recovery text it cannot follow.**
Capacity is global (`views.size >= maxLiveViews`, `desktop-webmcp-browser.js:621`) but eviction and listing are per sender (`:623`, `:906-907`). If another (e.g. popped-out supervision) window holds the live views, this window finds no candidate and gets `pool-full`, while `list` shows only this window's pages. The UI then states *"The pages below show their owners"* and instructs *"finish or revoke a waiting call, then close an idle page and retry"* (`WebMcpPages.tsx:60-64`, string `webmcp.pages.full`) — but the offending pages are not listed and cannot be closed from here. That is a false statement plus a dead-end instruction. Either list/evict cross-window candidates for the same app, or word the message for the "another window holds the pool" case and point at that window's Pages disclosure.

## Low

**4. LRU unload silently converts a paused page into access-off, contradicting the Pause text.**
`idle()` (`desktop-webmcp-browser.js:131-137`) does not consider `entry.paused`/`entry.connection`, so a hidden *paused* page (which the trust summary describes as keeping "the page and session connection", `WebMcpPages.tsx:136`) is a valid eviction candidate. The trust text is true when shown, and the reloaded page honestly reports "Access off", but the connection is dropped without a Pause-specific acknowledgement. Consider excluding paused pages, or naming it in the unload note.

**5. Two sessions of one project with the same title are indistinguishable to a screen reader.**
`WebMcpPages.tsx:68` builds the visible and accessible identity from `title · origin · project`; the session ID is only in `data-webmcp-session` (`:73`). Distinct keys are used correctly, but two equally-titled sessions produce identical accessible names for the show and revoke buttons (`:80`, `:96`). Add the session ID (or a short suffix) to the accessible name.

**6. The project-home "Needs you" header undercounts while the list shows waiting pages.**
`desktop/packages/ui/src/components/projects/NeedsYouQueue.tsx:81,94,96`: with one queue row plus one waiting page, the header badge reads `1` while two items are listed; with only waiting pages there is no heading at all. The titlebar count is correct (`NeedsYouButton.tsx:27-31`), so the surfaces disagree. Also, a `needsHuman` row with a null `directory` keys as `"\0ses_x"` (`:29`) and will not dedupe against that session's waiting page.

**7. `unload()` reads the URL before closing, unguarded.**
`desktop-webmcp-browser.js:146` calls `entry.view.webContents.getURL()` without the `isDestroyed()` guard used in `status()` (`:359`). If a renderer died without `entry.closed`, the eviction throws before `close()`, and the pane reports the generic `start-failed` instead of the pool-full recovery path (`EmbeddedWebMcpBrowser.tsx:234-240`).

**8. Waiting announcements inside the collapsed switcher are not announced.**
The per-page `<span role="status">` (`WebMcpPages.tsx:86-90`) and the pool-full `role="status"` paragraph (`:60-64`) live inside a closed `<details>`, so they are not exposed to assistive tech until the person opens the disclosure. The titlebar/popover/waiting-section paths do announce, so this is a partial gap only.

## Verified correct

- **Chosen-session revoke.** `WebMcpPages.tsx:19-34` sends the clicked page's `directory`/`sessionID`; the backend resolves `viewKeyFor(directory, sessionID)` and re-checks ownership (`desktop-webmcp-browser.js:877-899`). It never consults the shown view, and there is no path from this component to `disconnect` on another entry.

## Dispositions

No blocking issue. All findings fixed by codex with mutation probes (see `HANDOFF-r14a-codex.md`, "Review fixes"): Windows path identity through the shared view key, capped dormant records with one owner listener per window, a cross-window pool-full state with focus-owner actions, the Low items, and the post-round-13 audit P2 (bounded provider poll; access shown as interrupted and reconnecting). The locale loader stays strict: the English-fallback mechanism added by the author was removed and all strings were translated.
