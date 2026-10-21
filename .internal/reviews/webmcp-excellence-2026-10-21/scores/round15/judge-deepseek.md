## Round 15 judgment — deepseek-flash, source at `92775899` (read-only, nothing modified)

Work is complete: no remaining steps. The scores below were verified against source I read this session (UI panels, approval card, recap, Electron bridge, docs, CI workflow).

| Step | Score | Judgment (anchor) |
|---|---|---|
| A1 discover | **8** | Full descriptions, raw schema, hint badges, origin, visible truncation and advisory lint, still confined to the panel (`WebMcpToolPanel.tsx:692-703`, `:906-924`). |
| A2 enable and scope trust | **8** | Enable/Pause/Disconnect, per-session revoke and a trust summary; still no sign-out, and popups stay denied (`WebMcpPages.tsx:155-172`, `desktop-webmcp-browser.js:747`). |
| A3 watch live | **9** | Rows carry outcome, duration, preview, earlier-page marker, open the exact tool part, highlight it, and a running call links its approval (`WebMcpCallStrip.tsx:60-130`, `revealToolPart.ts:8-18`, `design-system.css:1021`). |
| A4 approvals | **8** | Effect sentence from call data plus the page's own hints, required inputs and "hints never approve", bidi-isolated (`PermissionCard.tsx:386-397`, `WebMcpApprovalToolInfo.tsx:51-75`); still no rendered approval-expiry outcome, and the tool-name chip at `:409` is un-isolated. |
| A5 failure recovery | **8** | Named browser causes, application errors, cancellation and interrupted-runtime recovery; a runtime-side rejection still has no explanation (`en.ts:2694-2701`, `:2730-2754`, `:10`). |
| A6 evidence after the task | **9** | Each recap step is a button to its exact call with duration, result, definition digest, a "(the tool has changed since)" flag, "Showing the latest N of M", copy-to-clipboard and never-called tools (`ReviewLandingBrowserEvidence.tsx:137-201`). |
| A7 pause and take over | **8** | Pause awaits a bounded page acknowledgement, reports stopped vs still-finishing, keeps the page and names the owner window with Focus (`native-webmcp.js:479-513`, `WebMcpCancellationStatus.tsx:6-19`, `WebMcpPages.tsx:79-98`). Two reproduced defects remain: the interrupt can fire during the 300 ms post-click delay (`native-webmcp.js:469`), and unfinished read/act/wait scripts drop out of later stop reports (`desktop-webmcp-browser.js:317-337`). |
| A8 several sessions | **9** | Pooled pages, per-session revoke, waiting surfaces, LRU unload, cross-window ownership and recovery (`WebMcpPages.tsx:99-148`, `:196-213`, `desktop-webmcp-browser.js:985-1000`). |
| B1 see registered tools | **8** | Registration truth, raw schema, lint, named rejections, truncation; nothing previews a runtime rejection before a call (`WebMcpToolPanel.tsx:873-975`). |
| B2 try and compare | **9** | Journal, editable replay, side-by-side compare, digest difference, regression export; secret-named Try it fields are password inputs and exports substitute placeholders (`WebMcpToolPanel.tsx:395-401`, `toolHelpers.ts:318-336`). |
| B3 iterate | **8** | Registration timeline, stale marks, drafts kept across reload; no automatic re-registration check (`WebMcpToolPanel.tsx:944-953`, `docs/webmcp-page-tools.md:56-59`). |
| B4 diagnose misuse | **8** | Property/rule/value-kind naming for manual and agent calls, definition-change flag, test export; still advisory, not the runtime's validator (`WebMcpToolPanel.tsx:190-224`, `:279-333`). |
| B5 onboarding docs | **9** | Quickstart, journal, replay, export, pooled pages, Pause agent and cancellation wording all documented with real content (`docs/webmcp-page-tools.md:33-118`, `:141-149`). |

**Means:** supervisor **A = 8.4** (67/8); builder **B = 8.4** (42/5).

**Moved vs round 14 (my card):** A3 8→9 and A6 8→9. Unmoved: A1, A2, A4, A5, A7, A8, B1–B5. A7 held at 8 despite new acknowledgement wiring, because the same round's reproduced P1/P2 sit in that cancellation path.

**Three changes that raise the lowest steps most**
1. **Close the two cancellation defects** — track the executing script separately from `activePageRequestId` so the post-click delay can never be interrupted, and keep unfinished page requests discoverable through settlement; lifts A7 and A5 and unblocks the third judge (`native-webmcp.js:411-478`, `desktop-webmcp-browser.js:321-337`).
2. **Render an explicit WebMCP approval-expiry outcome and isolate the tool-name chip** — closes W4's second ask and removes the reading-order spoof surface; lifts A4 (`PermissionCard.tsx:404-411`, `:465-471`).
3. **Sign-out plus a read-only grant list (origin, tool, schema hash, re-ask on change)** — desktop-only, no new grant; lifts A2 off prose (`WebMcpPages.tsx:155-172`).

Caveats: A7 depends on the one judge holding the reproduced P1; Windows/Ubuntu W7 remains `continue-on-error: true` (`desktop-ci.yml:305-307`), so cross-platform WebMCP isolation is unproven from source. ADR-266 optional runtime fields received no credit. Verification was source reading only — no test suite, typecheck, or bridge journey was run, and no files were modified.