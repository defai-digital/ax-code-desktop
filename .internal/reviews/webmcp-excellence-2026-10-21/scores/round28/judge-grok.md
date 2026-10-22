I'll judge round 28 from source only: the PRD bar, the prior ballots, and the WebMCP changes since round 27. No files will be modified.Round 27 left every step at 8 or 9. I'll read the round 28 diff and the surfaces those scores named.**Round 28 at `e36aad55`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. `92775899` is the round-15 docs commit and an ancestor of this tree. v7.28.2 sends `definitionDigest` and a redacted `inputPreview`; the approval card renders that shape (`PermissionCard.tsx:413`, `toolHelpers.ts:446`).

Round 28 blanks an echoed secret under every descendant key of the object that declares the sensitive field, including percent-encoded and JSON-escaped forms, and replaces the whole string (`webmcp-redaction.mjs:209`). A sibling outside that object still shows the value. One collected value that fails echo normalization makes every free-text descendant match (`webmcp-redaction.mjs:194`). Cancelling an owner close or quit leaves the selected page bound and navigable, and confirmation does not switch the shown page (`desktop-webmcp-browser.js:490`, `:560`, `:1578`). A scalar Try-it field masks a credential-shaped value and offers show/hide (`WebMcpToolPanel.tsx:356`). Enum and boolean controls render before that mask (`WebMcpToolPanel.tsx:358`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | The catalog starts collapsed, while truncation and a named rejection stay visible outside it (`WebMcpToolPanel.tsx:964`, `:990`). |
| A2 enable and scope trust | 9 | Revoke is per session, the trust summary adds no grant, and sign-out clears that project's partition (`WebMcpPages.tsx:135`, `desktop-webmcp-browser.js:1252`). |
| A3 watch live | 8 | The strip shows duration, an 8-character digest, and the failure summary, and cuts arguments with `slice(0, 140)` (`WebMcpCallStrip.tsx:114`, `:151`). |
| A4 approvals | 8 | The card shows the effect sentence, the runtime preview, and one digest, and limits the answer to this call (`PermissionCard.tsx:413`, `:488`). |
| A5 failure recovery | 8 | The collapsed row shows the shared summary, which keeps the first finding only and can replace the reason with `[redacted]` (`webMcpFailureSummary.ts:12`, `ToolPart-impl.tsx:1687`). |
| A6 evidence after the task | 8 | The copied recap includes rejections, digest, and duration, and names an unknown association (`ReviewLandingBrowserEvidence.tsx:98`, `:107`). |
| A7 pause and take over | 8 | Pause waits 500 ms and reports stopped or still finishing (`native-webmcp.js:10`). |
| A8 several sessions | 8 | A cancelled close keeps the selected page bound (`desktop-webmcp-browser.js:1578`); the compact switcher omits the per-page waiting label (`WebMcpPages.tsx:80`). |
| B1 see registered tools | 8 | Hints and schema sit behind the same collapsed catalog that names a rejection (`WebMcpToolPanel.tsx:1003`, `:990`). |
| B2 try and compare | 8 | An off-list enum asks before send, a missing runtime receipt is explained, and a credential-shaped scalar is masked (`WebMcpToolPanel.tsx:329`, `:356`). |
| B3 iterate | 8 | Registration history keeps the property diff as one JSON blob (`WebMcpToolPanel.tsx:1025`). |
| B4 diagnose misuse | 8 | Findings name property, rule, and value kind; an echo is blanked as a whole string, and a sibling of the declaring object still shows the value (`webmcp-redaction.mjs:209`, `:146`). |
| B5 onboarding docs | 8 | The guide linked from the panel records the 2 KiB preview and name-based input masking, and stops before any-key echo blanking (`docs/webmcp-page-tools.md:308`, `:277`). |

**Means:** A **8.125** (65/8). B **8.00** (40/5).

**Versus round 27:** no step moves. All four ballots already had every step at 8 or more, with A2 at 9. Wider echo blanking, cancelled-close bindings, and value-shaped field masking leave the same ceilings.

**Three changes that lift the lowest steps most:**

1. Replace only the echoed secret inside every string in the report, including siblings and ancestors of the declaring object, and keep the surrounding sentence. A match now blanks the whole string and stops at that object (`webmcp-redaction.mjs:146`, `:209`). That lifts **B4** and **A5**.
2. Render `propertyDiff` as added, removed, and changed rows (`WebMcpToolPanel.tsx:1025`). That lifts **B3**.
3. Show the waiting label in the compact grid switcher (`WebMcpPages.tsx:80`) and stop cutting strip arguments at 140 (`WebMcpCallStrip.tsx:114`). That lifts **A8** and **A3**.
