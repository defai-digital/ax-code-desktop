# WebMCP P1 audit — HEAD e36aad55 (read-only, English)

**Verdict: no P1.** I found no path that loses work without a confirmation, lets the agent act on a different page/session, runs a call without approval, leaks a credential to screen/log/disk, claims success for a failed action, or leaves a pane unusable with no recovery.

## Verified against the four earlier passes

- **Redaction** — every display/IPC/persistence site in scope delegates to the shared helpers: browser status/url/origin/error and close-dialog titles (`desktop-webmcp-browser.js:158,411,591-601`), rejection labels (`native-webmcp.js:30-34`), approvals and generic metadata (`PermissionCard.tsx:74,133,419`; `WebMcpApprovalToolInfo.tsx:61,78-80`), call strip and recap (`webMcpCalls.ts:137-159`; `ReviewLandingBrowserEvidence.tsx:99,107,203`), journal/run text (`useWebMcpBrowserStore.ts:341-390,573-587`), diagnosis and runtime rejections (`webMcpDiagnosis.ts:212-227`), transcript diagnosis (`WebMcpCallDiagnosis.tsx:22,59,71`). Round-28 items are present: echo masked under any key (`redactWebMcpReport:147-196`), bindings kept after a cancelled window close (`ownerClosures.onClose:483-503`, `authorizeClose` `reprompted:377-404`), value-shaped credential masking (`WebMcpToolPanel.tsx:356`).
- **One browser owner** — `lookup` sender check and `owned-by-another-window` (`desktop-webmcp-browser.js:231-235,918-929`), focus only through disclosed handles (`:86-92,1290-1300`), grid pane hides its switcher while popped (`SessionGrid.tsx:289` + `gridWindowOwns`, `sessionGridPopout.ts:17-19`), so two panes cannot drive one view.
- **Approval / grant scope** — desktop provider offers no standing "always" (`PermissionCard.tsx:210-218`); `enable` needs visible pane, live adapter, capability, and runtime-resolved session/project (`:1380-1454`); `tryTool` needs current origin, generation and definition digest (`:1474-1511`).
- **Work preservation and shutdown** — sticky dirty flag (`:1058-1062`), bounded 250 ms probes (`browser-eviction.js:8-43`), veto before confirmation (`:439-446`), refusal blocks quit/restart/update (`browser-shutdown.js:12-15`).
- **Checker** — `evaluateReport` computes expected-tool/run identity on the raw report before redaction and uses keyed receipts (`webmcp-check-lib.mjs:85-144`); console/report output is filtered (`webmcp-check.mjs:19,59,66,77-87`).

## P2 findings

**1. Close confirmation can end in a silent no-op** — `hooks/useWebMcpCloseConfirmation.tsx:20-25`, `components/mcp/WebMcpPages.tsx:40`, `components/layout/EmbeddedWebMcpBrowser.tsx:452-454`.
Repro: page with unsaved work whose identity changes continuously (a `setInterval` setting `document.title` or `location.hash`), **Close** in Pages or **Sign out** → confirm. Main answers `confirmationRequired` again for the changed identity (`desktop-webmcp-browser.js:373-404`); the renderer's two attempts run out and it returns `null`, which callers interpret as "user cancelled". No toast, no state change.
Impact: the user confirms twice and nothing visibly happens; recovery requires the Pages list. Fix: after the loop, offer an explicit "close anyway" answer (main already accepts `{closeAnyway:true}` at `:565`).

**2. Pane teardown discards a confirmation reply** — `EmbeddedWebMcpBrowser.tsx:232-235`.
On the non-pooled path (`list` unavailable → `pooled=false`) unmount sends `close` and swallows the reply. A dirty page is correctly kept, but nobody is asked and the reply is dropped.
Impact: an orphaned live view counts toward `maxLiveViews`; the next `create` can fail `pool-full` with no pane bound to the page holding the work. Fix: treat `confirmationRequired` like the pooled path (`bounds {0,0,0,0}`) and leave closure to the switcher.

**3. Transcript schema check never reports a changed definition** — `components/mcp/WebMcpCallDiagnosis.tsx:91`: `currentDigest={call.definitionDigest ?? ""}`, so `webMcpDefinitionChanged(digest, currentDigest)` compares the digest with itself and is always false. The panel (`WebMcpToolPanel.tsx:256,287`) and the landing recap (`ReviewLandingBrowserEvidence.tsx:81,168-175`) do compare against the current registration, so only the transcript surface is silent.
Impact: an agent call made against an older definition is not marked as such in the conversation, though `docs/webmcp-page-tools.md:77-78` says the check reports that. Not a false claim — an omission. Fix: resolve the current definition by `invocationID` from `definitions` and pass its digest, leaving `""` only when no current binding exists.

**4. Address history rewritten every second** — `stores/useWebMcpBrowserStore.ts:488-502`, called from `EmbeddedWebMcpBrowser.tsx:170-173` on each 1 s status poll. The identical origin entry is filtered out and re-written, re-serializing up to 64 entries / 200 KB. Fix: return early when the head entry already matches.

**5. Dead duplicate dirty test in close authorization** — `desktop-webmcp-browser.js:387-391`: `document.entry.possibleUnsavedWork` appears twice in one `||` chain around `await canDiscardDocument`; the second occurrence can never be evaluated on its own. Impact today is none, but it hides the intended post-await recheck that eviction performs separately (`:937-945`).

**6. Misleading error for a dormant page that cannot reopen** — `desktop-webmcp-browser.js:1332-1341`: if `createView` throws (`pool-full`, owner closing) the subsequent `lookup` reports "This browser belongs to another window", steering the user to `focusOwner` instead of the pool-full state. Repro: four unevictable live pages, then **Show** a dormant page. No data loss. Fix: re-map to `pool-full` / `start-failed`.

## Notes

- Ignored as instructed: uncommitted `config/`, `pnpm-lock.yaml`, version pins.
- `http://` on a public host loads but is never grantable (`agentOrigin`, `native-webmcp.js:47-68`) and is surfaced as `page:"unsupported"` — consistent with the guide, not a mismatch.
- Suggested order: items 1 and 6, then 3 (visible documentation gap).