我先讀審計、PRD 與 WebMCP UI 原始碼，再獨立回答這次設計討論。PRD 邊界已對上。接著讀瀏覽器、核准卡與設定畫面的實際控制項。Developers who build or use WebMCP value a workflow they can watch, judge, and resume. The outcomes PRD defines that as a demonstrated workflow, a reproducible failure, and a reviewable handoff (PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md:12-16). Chrome's tool-design note, cited there, says a catalog alone is not the value; discovery, execution, and interpretation are (same file:149-150). The cited explainer adds human visibility and page control (151-152). Today the pane shows a count, forgets the page, and titles every call "Desktop webmcp".

## PLUS

1. **Page tool panel: name, description, schema, and a human Try it.** A builder sees the registration before asking the agent. The adapter already stores name, description, and inputSchema (`native-webmcp.js:129-134`); status publishes only the length (`desktop-webmcp-browser.js:135`); the pane prints "{count} tools" (`en.ts:2642`). Audit P2, idea 3, CS-21. Task: T6 and build-and-verify. Cost: Desktop only. Try it runs as the user and does not grant the agent (ADR-009 decision 4). Check: two fixture tools are listed with access off; Try it shows that tool's result and adds no session tool part.

2. **Per-page strip: operation, target, result, and the decision.** T6 is visible on the page. Audit idea 1 and P2; every row is titled by `formatUnknownToolDisplayName` (`toolHelpers.ts:197-203`, `ToolPart-impl.tsx:1968-1969`); CS-21; T6 in supervision PRD section 6. Task: T6. Cost: Desktop only for fields already on the transcript. Invoke arguments need the runtime (audit P1.4). Check: one list and one invoke show both results, in order, with allow-once or deny.

3. **Restore the last URL; restore sign-in only through an explicit Remember control.** The next run starts on the same app. Audit P1.2 and journey 07b; close or session change creates a fresh browser (`EmbeddedWebMcpBrowser.tsx:95-125`) and wipes the partition (`desktop-webmcp-browser.js:108-123`). ADR-009 decision 6 already requires that opt-in. CS-20. Task: return to work, then T6. Cost: Desktop only. Check: reopen shows the last https URL; cookies return only after Remember; access stays off until Enable.

4. **One failure sentence and one fix.** A bad URL or a covered pane names the cause and the next click. Audit P1.1, P1.3, P1.5; every thrown command becomes "The browser action could not complete." (`EmbeddedWebMcpBrowser.tsx:211-219`, `en.ts:2640`); a dialog sets zero bounds and disconnects (`EmbeddedWebMcpBrowser.tsx:144-150`, `desktop-webmcp-browser.js:475-478`). Task: find and repair. Cost: Desktop only for errors main already logs. Stable agent reason codes need the runtime (audit idea 4). Check: an unsafe-port URL shows the logged reason and focuses the address bar; while a dialog is open a pending approval cannot be confirmed.

5. **On zero registered tools, say whether read and act are available.** Ordinary sites stay usable. Zero tools is only "no page tools registered" (`webMcpSummary.ts:112-119`, `en.ts:2647`); audit P2; the page program already implements read, click, type, and select (`webmcp-page.js:52-127`, ADR-014). Task: T6 on a tool-less page. Cost: Desktop only for the copy. Uncertain: show it only when pinned runtime 7.28.0 reports those operations; this repo's pin file does not include the runtime schema. Check: a rejected page never reads "Agent access on" (CS-20).

6. **Mission Control shows that this session has the project browser.** Supervising many sessions does not require opening each chat. The pane already binds `sessionID` (`EmbeddedWebMcpBrowser.tsx:50,101`); CS-23; task T2. Cost: Desktop only for enrolled origin. A call-by-call feed needs runtime events. Check: the board names the origin while access is on and clears it when the pane closes.

## MINUS

1. **Remove "The agent cannot open pages itself."** Users stop waiting on a URL the agent may open. `en.ts:2663-2664`; audit P1.5; `navigate` has been a runtime operation since 7.25.8 (PRD-2026-10-15-agent-page-interaction.md:9-11). Task: T6. Cost: Desktop only. Check: the waiting state does not contain that sentence.

2. **Stop the runtime-update sentence when the probe omitted `compatible`.** A silent probe is not an old runtime. `useWebMcpBrowser.ts:107` coerces a missing flag to false; `en.ts:2633`; audit P1.5; the hook's own comment says unknown stays unknown (`useWebMcpBrowser.ts:83-85`). Task: find and repair. Cost: Desktop only. Check: a reply without `compatible` does not show the update string.

3. **Stop titling approvals "webmcp".** The decision is the page tool or the element. `PermissionCardTools.ts:27-28` forces that title; the body can omit the tool (`PermissionCard.tsx:367-403`); audit P2. Task: T1. Cost: Desktop only. Check: an invoke title is the page tool name; an act title includes the element name when the runtime sent it (audit P1.4).

4. **Hide "Always allow on this site" unless origin and capability are named.** Users cannot accept a grant the card cannot describe. The button is `canSaveWebMcpApproval` (`PermissionCard.tsx:159-162,502-523`); audit P2 says the runtime sends no always-scope; supervision PRD section 5 bars standing grants without an AX Trust policy. Task: T1. Cost: Desktop only. Check: a project-browser approval with no scope offers Allow once and Deny only.

5. **Remove the duplicate enable buttons.** A draft shows two "Start a session & enable agent access" buttons, and Preview adds a third beside a disabled Go. Audit journey; `EmbeddedWebMcpBrowser.tsx:332-339,380-384,463-473`. Task: T6. Cost: Desktop only. Check: a draft has one primary button, and Go enables once the browser is ready.

## MULTIPLY

1. **Split access into loaded, offered, granted, and paused.** "On" cannot survive a dialog or a rejected page. One `enabled` flag drives the success copy (`webMcpSummary.ts:94-128`); zero bounds disconnect with no user state (`desktop-webmcp-browser.js:475-478`); CS-20. Task: human-agent cooperation. Cost: Desktop only. Check: opening Settings moves the strip to paused and back to the same origin; granted is absent while the runtime rejects the page.

2. **Split each approval into read, act, or invoke.** The user sees a submit or a tool call before allowing it. The card prints origin and operation (`PermissionCard.tsx:367-403`); the page program already marks submit (`webmcp-page.js:64-65`); audit P1.4. Task: T1. Cost: Desktop only for act fields the runtime already sends. Invoke arguments need the runtime. Check: an act approval shows element name and submit, with typed text redacted (ADR-014 decision 6).

3. **Split each transcript row into transport, target, and outcome.** A failed call must not look like a success. Audit P2, screenshot 11; error color applies only to status error or failed (`ToolPart-impl.tsx:986,1703-1704`); the title omits the page tool (`toolHelpers.ts:197-203`). Task: T6. Cost: Desktop only. Check: a collapsed failed invoke is an error and names the page tool.

4. **Split open-a-page from grant.** Enable on about:blank only leads to "Waiting for a page" (audit journey); Go is disabled while the address is editable (`EmbeddedWebMcpBrowser.tsx:288-300`); the hint appears after enable with no origin (`348-351`). Task: T6. Cost: Desktop only. Check: Enable stays disabled until the origin is grantable, and the T6 log has no enable-on-blank step.

## DIVIDE

1. **Keep names and recent calls in the pane.** Header, Services, and Settings repeat the same count (`WebMcpHeaderButton.tsx:50-54`, `WebMcpBrowserTools.tsx:46-51`, `WebMcpBrowserTools.tsx:88-92`, `EmbeddedWebMcpBrowser.tsx:314-320`). Audit P2; CS-22. Task: T6 discovery. Cost: Desktop only. Check: Services and Settings show no tool count; the header tooltip uses the pane's state word.

2. **Give the three WebMCP things different titles in one Settings group.** The allowlist is per Chrome-bridge server (`WebMcpAllowlistSection.tsx:26-28`) but titled "WebMCP allowlist" (`en.ts:3387`); the header says "WebMCP" (`WebMcpHeaderButton.tsx:46`); a server named `webmcp` is the bridge (`webMcpBridgeCoordination.ts:31`). Audit P2. Task: choose the correct control. Cost: Desktop only. Check: the browser title and the bridge title differ in all 14 locales, and the bridge section appears only for a connected bridge.

3. **One per-project record for URL, origin, access, and Remember.** The surfaces disagree because URL is component state (`EmbeddedWebMcpBrowser.tsx:62`), access resets at `95-125`, storage is wiped at `desktop-webmcp-browser.js:108-123`, and capability is a separate cache (`useWebMcpBrowser.ts:75-77`). Task: return to work. Cost: Desktop only. Check: after restart, header, pane, and Settings show the same origin and the same access word.

4. **One failure sentence on pane, tooltip, and Services.** `describeWebMcpError` collapses every failure (`webMcpSummary.ts:22-37,70-77`) and the banner repeats it (`EmbeddedWebMcpBrowser.tsx:359-366`), while main logged a specific code (audit P1.3). Task: find and repair. Cost: Desktop only. Check: the unsafe-port fixture shows one identical sentence in all three places.

## Top 3

1. The page tool panel (PLUS 1). The names are already in the guest. This is the build-and-use loop, at Desktop-only cost.
2. The failure sentence and the paused state (PLUS 4, MULTIPLY 1). A false "on" and a generic banner block every later step.
3. The activity strip (PLUS 2). It is the acceptance test of T6, using transcript fields Desktop already has.

## Risk

Page-supplied names, schemas, and results are untrusted website data (PRD-2026-10-15 requirement 3; outcomes PRD section 7). A richer panel can make a page tool look like an AX Code action, so page content stays visually separate from Desktop status. Detach still invalidates pending work and must not reattach under the old grant (ADR-009 consequences). Remember-sign-in stays the explicit opt-in that decision already requires.
