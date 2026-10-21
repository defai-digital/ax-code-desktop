我先讀控制用的 PRD、round 15 分數與 92775899 之後的變更，再只依原始碼給分。Round 15 的缺口已對上。接下來只核對 16、17 輪在原始碼裡實際落地的行為。**Round 17 at `7f63b436`.** Read-only judgment of `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/` on `92775899..HEAD`. ADR-266 call fields (arguments, `inputPreview`, call digest, `metadata.reason`) get no credit. Uncommitted runtime pins ignored.

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Origin, hint badges, raw schema, truncation, and a named rejection make discovery solid, still short of runtime-validator parity (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:1006`). |
| A2 enable and scope trust | 9 | Sign-in popups stay in the isolated profile while the agent waits, Sign out clears that project's pages and storage after an unsaved-work check, and saved history keeps only the origin (`desktop/packages/electron/src/desktop-webmcp-browser.js:947`). |
| A3 watch live | 8 | A running row opens its transcript part and, while approval is pending, the approval itself, with duration from the part's own timestamps (`desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:122`). |
| A4 approvals | 7 | With no runtime digest the card withholds the page definition, and with no runtime arguments it says they are missing, so the allow-or-deny choice stays under-informed (`desktop/packages/ui/src/components/chat/WebMcpApprovalToolInfo.tsx:53`). |
| A5 failure recovery | 7 | The adapter posts an allowlisted outcome and reason, while the transcript reads a reason only from call metadata and folds an error status into a generic application error (`desktop/packages/ui/src/lib/toolHelpers.ts:572`). |
| A6 evidence after the task | 8 | The landing recap scans and copies the whole turn, with duration, result, and a definition note when a digest is already on the call (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:96`). |
| A7 pause and take over | 8 | Pause waits for cancellation, interrupts only the original document, and leaves that page with the person (`desktop/packages/electron/src/native-webmcp.js:509`). |
| A8 several sessions | 8 | Each session has its own page, hidden calls wait, and eviction keeps a page that may hold unsaved work (`desktop/packages/electron/src/browser-eviction.js:25`). |
| B1 see registered tools | 8 | The catalog shows kind, hints, origin, raw schema, and a named rejection when registration fails (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:990`). |
| B2 try and compare | 8 | Try it is refused as a stale form unless origin, generation, and definition digest match the displayed tool, and sensitive fields and JSON stay masked (`desktop/packages/electron/src/desktop-webmcp-browser.js:1410`). |
| B3 iterate | 7 | Registration history records added, removed, and changed tools as digest pairs, and drafts survive only for the same digest (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:1019`). |
| B4 diagnose misuse | 7 | Manual diagnosis names the property, rule, and value kind; an agent call with no runtime arguments is reported as unavailable (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:199`). |
| B5 onboarding docs | 8 | The quickstart covers try-it binding, export limits, sign-in popups, sign-out, and unsaved-work confirmation (`docs/webmcp-page-tools.md:250`). |

**Means:** A **7.88** (63/8). B **7.60** (38/5).

**Versus round 15** (all three judges): **A2 moved 8 → 9**. **B2 moved** off the round-15 floor of 7 to 8 (MiniMax was already 8; deepseek-flash was 9). A6's whole-turn copy is real and the score stays 8, because invoked-definition identity still arrives only as runtime metadata. A1, A3, A7, A8, B1, and B5 stay at 8. A4, A5, B3, and B4 stay at 7 on this ballot. Redaction, origin-only history, stale-form binding, export limits, and unsaved-work checks hold those scores. They do not close them.

**Three changes that lift the lowest steps most:**

1. Pin a signed runtime that attaches masked arguments, the invoked definition digest, and an allowlisted failure reason to each call, and show them on the approval card, compare pane, diagnosis, and recap. That lifts A4, A5, B2, and B4 together.
2. Until that pin, project the adapter reply's allowlisted `output.reason` into the strip, transcript, and recap, and show an approval-timeout as its own outcome. That lifts A5 and A4.
3. Replace registration digest pairs with a property-level schema diff, and keep that invoked schema for diagnosis after the tool unregisters. That lifts B3 and B4.
