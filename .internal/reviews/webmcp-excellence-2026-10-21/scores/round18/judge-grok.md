我會依原始碼獨立評分第 18 輪 WebMCP，先讀控制紀錄、第 17 輪分數與 `7f63b436..HEAD` 的變更，再核對各步驟是否真的做在原始碼裡。第 17 輪的缺口是核准參數、過期結果、完整說明與屬性差異。我接著核對 `7f63b436..HEAD` 與釘選的 v7.28.2 實際送出的欄位。核准卡與呼叫條已經對上過期結果。我接著讀核准呈現、屬性差異，以及執行階段實際送出的欄位。**Round 18 at `7811c298`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. v7.28.2 puts `definitionDigest` and a redacted `inputPreview` on the approval ask only (`../ax-code` `packages/ax-code/src/tool/desktop_webmcp.ts:217-227`). The completed tool part keeps `providerID`, `generation`, `operation`, and `truncated` (`desktop_webmcp.ts:251-259`, written at `processor-impl.ts:1103`). Uncommitted runtime pins are ignored.

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | The catalog still shows hint badges, the raw schema, and an explicit truncation note, short of runtime-validator parity (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:452`). |
| A2 enable and scope trust | 9 | Sign-out still clears that project's isolated partition after the unsaved-work check, and saved history stays origin-only (`desktop/packages/electron/src/desktop-webmcp-browser.js:1173`). |
| A3 watch live | 8 | A running row opens its transcript part and, while pending, the approval; the strip also prints an unanswered ask (`desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:63`). |
| A4 approvals | 8 | The card shows the redacted `inputPreview`, keeps the runtime `… (N bytes, M not shown)` marker, and expands the full page description when `definitionDigest` matches the live catalog; a vanished ask is recorded as unanswered (`desktop/packages/ui/src/components/chat/PermissionCard.tsx:471`). |
| A5 failure recovery | 7 | The transcript still shows a generic failure unless the part status is timeout or cancelled, and the completed part carries no allowlisted reason (`desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1676`). |
| A6 evidence after the task | 8 | The landing recap still counts and copies the whole turn, and names a definition only when that digest is already on the call (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:107`). |
| A7 pause and take over | 8 | Pause waits for cancellation and reports stopped or still finishing, leaving the page with the person (`desktop/packages/electron/src/native-webmcp.js:14`). |
| A8 several sessions | 8 | Each session keeps its own page, hidden calls wait, and eviction probes a page that may hold unsaved work (`desktop/packages/electron/src/browser-eviction.js:29`). |
| B1 see registered tools | 8 | The catalog shows kind, hints, origin, raw schema, and a named rejection when registration fails (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:765`). |
| B2 try and compare | 8 | A credential-shaped name is tried by its definition digest (`desktop/packages/electron/src/desktop-webmcp-browser.js:1401`); the compare pane still has no agent preview, because the completed part never receives `inputPreview`. |
| B3 iterate | 8 | Registration history keeps 32 events, including the previous definition, and prints a property diff of type, enum, description, and required (`desktop/packages/ui/src/lib/webMcpPropertyDiff.ts:11`). |
| B4 diagnose misuse | 7 | Diagnosis uses the digest-named schema only when that digest is already on the call; a real v7.28.2 call still reports arguments unavailable and then checks the current schema (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:308`). |
| B5 onboarding docs | 8 | The guide now describes approval receipts, the 32-event diff, and the opaque try selector, while the schema-check row says the preview reaches that check (`docs/webmcp-page-tools.md:232`). |

**Means:** A **8.00** (64/8). B **7.80** (39/5).

**Versus round 17** (this ballot): **A4 moved 7 → 8** and **B3 moved 7 → 8**. A5 and B4 stay at 7. A1, A2, A3, A6, A7, A8, B1, B2, and B5 stay where they were. W3, W4, W6, and W8 run in the three-platform `supervision-journeys` job beside W1, W2, W5, and W7 (`.github/workflows/desktop-ci.yml:319`). That step is `continue-on-error`, and W4's expiry is the scripted stub (`desktop/packages/electron/scripts/e2e/project-browser-tasks.mjs:185`).

**Three changes that lift the lowest steps most:**

1. Copy the approval's `definitionDigest` and `inputPreview` onto the tool-part metadata the strip, compare pane, diagnosis, and recap already read. That lifts B4, and the compare half of B2, and A6.
2. Show the adapter's allowlisted failure reason on the transcript, strip, and recap, including when an ask was unanswered. That lifts A5.
3. Record an approval timeout as its own outcome on the card and the landing recap, and render property diffs as a readable constraint list that refuses the current schema when the named digest is gone. That lifts A4 and B3 toward 9, and the remaining B4 hole.
