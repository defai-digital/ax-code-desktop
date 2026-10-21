## Audit result: **no P1**

Method: full read of the three Electron sources, the listed UI components/lib/store plus their supporting hooks (`useWebMcpPages`, `useWebMcpBrowser`, `useWebMcpPoolProjection`, `useWebMcpStorageEvents`, `useWebMcpTranscriptCalls`, `webMcpCatalog`), `webmcp-page.js`, the `webmcp-check` scripts, and the wiring in `main.js`. Static audit; no runtime reproduction was attempted. Nothing was modified.

No code path was found that loses user work/data, lets the agent act on a wrong page/session/project or without approval, leaks a credential to logs/disk, claims a false outcome, or hangs unrecoverably. Request identity is enforced per call (`desktop-webmcp-browser.js:597-604` provider/epoch/project/session; `native-webmcp.js:287-302` generation/origin/frame/digest), visibility gates every request, pause/disconnect acknowledgements are honest ("changes already made on the page stay"), every await is bounded (2s/20s/30s), and `webmcp-check`'s exit codes and per-redirect origin rules match `docs/webmcp-page-tools.md`.

### P2

1. **Second window gets an unrecoverable-looking pane for the same session's browser.** `desktop-webmcp-browser.js:691-695` throws "This browser belongs to another window" on `create`; `EmbeddedWebMcpBrowser.tsx:238-245` flattens that to generic `start-failed`, and the offered "Reopen" fix (`:416-423`, `browserId` null → restart → same throw) loops forever. Repro: open the project browser for a session in window A; open the same session's browser in window B. B's Pages list is empty (`list` is per-sender, `desktop-webmcp-browser.js:997-999`) and the `otherWindows` explanation only renders on pool-full (`EmbeddedWebMcpBrowser.tsx:433`). Impact: pane unusable in B with no in-UI explanation; the real recovery (close A's pane) is never named. Closest finding to the P1 bar, but not data loss.

2. **The manual surface never redacts secrets.** `WebMcpToolPanel.tsx:290-292` prints journal input raw (`inputText`), `:372-402` renders every field as a plain `<input>` even for `password`/`token`-named properties, and `:137` embeds raw input in the regression snippet. Repro: type a real secret into a Try-it `password` field and run. Impact: the value stays visible on screen, in the journal/compare rows, and on the clipboard until the origin changes. In-memory only, user's own pane, never logged or persisted (`useWebMcpBrowserStore.ts` has no persist; only stripped addresses reach localStorage, `:412-479`) — hardening gap, not a P1 leak. The agent side is redacted (`toolHelpers.ts:431-454`).

3. **Adapter-level invoke failures reach the transcript without a reason.** `desktop-webmcp-browser.js:666-678` catches any adapter rejection into `{status:"Error"}`, discarding `invocationError` outcome/reason (`native-webmcp.js:9`) — e.g. `page-changed`, `definition-changed`, `provider-gone`, or "Another browser operation is in progress" (`native-webmcp.js:299-300, 378`). Repro: pipeline two invokes, or reload mid-invoke. Impact: the call strip/recap shows a failed row with no `failureReason` (`webMcpCalls.ts:119-127`), thinner than the WX-03 vocabulary shared elsewhere; still an honest failure, never a false success.

### P3 (brief)

- `focusOwner` has no sender check and `list` exposes other windows' view ids (`desktop-webmcp-browser.js:975-983, 989-996`): any window can focus another; no content or tool access crosses.
- `lookup` reports "This browser belongs to another window" for a merely-closed view (`:263`), e.g. enable-after-close.
- Guest-profile downloads are silently prevented (`:715`): a page's "export/download" button does nothing, undocumented in the guide.
- The address bar can transiently revert to the old URL during a navigation from a 1s status poll (`EmbeddedWebMcpBrowser.tsx:153-155`); the load itself is unaffected.
- An external Enable click consumed at the 150ms tick is dropped if a command is busy (`:395-398` then `:341`); manual retry works.
- Docs nit: "opening another unloads the least recently used idle hidden page" holds only within one window; cross-window it becomes pool-full (candidate filter `:698`).

Per DoD item 3 of PRD-2026-10-21-webmcp-excellence-v1, this audit run reports no P1.