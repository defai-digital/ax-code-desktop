I'll judge round 27 from source only: the PRD bar, prior ballots, and the WebMCP paths that round 27 claims to have changed.HEAD is the round 27 merge. I'll read the rubric, prior ballots, and the WebMCP source that the new masking actually reaches.Round 24 left A5 at 7. I'll check whether rounds 26 and 27 actually close that gap and the other claimed surfaces.**Round 27 at `1442693e`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. The pin `92775899` is the round-15 docs commit. v7.28.2 sends `definitionDigest` and a redacted `inputPreview`; the approval card renders that shape (`PermissionCard.tsx:413`).

Round 27 blanks `message`, `detail`, and `description` on the object that declares the sensitive field when they repeat its value (`webmcp-redaction.mjs:171`, `:216`). A sibling or ancestor string still shows it. `{ message: "password was DEMO_PRIVATE_VALUE", error: { field: "password", got } }` keeps the secret in `message`.

Round 26 is in this tree: one redacted summary on the collapsed row and the strip (`ToolPart-impl.tsx:1687`, `WebMcpCallStrip.tsx:149`); native start names the stage (`native-webmcp.js:153`); an off-list enum asks before send (`WebMcpToolPanel.tsx:874`); compare names a missing receipt (`WebMcpToolPanel.tsx:329`); Mission Control shows a waiting chip (`MissionControlRow.tsx:283`); a grid pane opens that session's page (`SessionGrid.tsx:289`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | The catalog starts collapsed, while truncation and a named rejection stay visible outside it (`WebMcpToolPanel.tsx:956`, `:974`). |
| A2 enable and scope trust | 9 | Revoke is per session, the trust summary adds no grant, and sign-out clears that project's partition (`WebMcpPages.tsx:135`, `desktop-webmcp-browser.js:1244`). |
| A3 watch live | 8 | The strip shows duration, an 8-character digest, and the failure summary, and cuts arguments with `slice(0, 140)` (`WebMcpCallStrip.tsx:114`, `:149`). |
| A4 approvals | 8 | The card shows the effect sentence, the runtime preview, and one digest, and limits the answer to this call (`PermissionCard.tsx:413`, `:488`). |
| A5 failure recovery | 8 | The collapsed row shows the shared summary, which keeps the first finding only and can replace the reason with `[redacted]` (`webMcpFailureSummary.ts:12`, `ToolPart-impl.tsx:1687`). |
| A6 evidence after the task | 8 | The copied recap includes rejections, digest, and duration, and names an unknown association (`ReviewLandingBrowserEvidence.tsx:98`, `:197`). |
| A7 pause and take over | 8 | Pause waits 500 ms and reports stopped or still finishing (`native-webmcp.js:10`). |
| A8 several sessions | 8 | Mission Control shows a waiting chip and each grid pane opens its session page; the compact switcher omits the per-page waiting label (`MissionControlRow.tsx:283`, `WebMcpPages.tsx:128`). |
| B1 see registered tools | 8 | Hints and schema sit behind the same collapsed catalog that names a rejection (`WebMcpToolPanel.tsx:408`, `:985`). |
| B2 try and compare | 8 | An off-list enum asks before send, and a missing runtime receipt is explained (`WebMcpToolPanel.tsx:874`, `:329`). |
| B3 iterate | 8 | Registration history keeps the property diff as one JSON blob (`WebMcpToolPanel.tsx:1017`). |
| B4 diagnose misuse | 8 | Findings name property, rule, and value kind; a repeated secret is cleared only inside the declaring object's prose fields (`WebMcpCallDiagnosis.tsx:20`, `webmcp-redaction.mjs:86`). |
| B5 onboarding docs | 8 | The guide linked from the panel records the 2 KiB preview and pair redaction, and stops before prose-echo masking (`docs/webmcp-page-tools.md:308`, `WebMcpBuilderHint.tsx:7`). |

**Means:** A **8.125** (65/8). B **8.00** (40/5).

**Versus round 26:** no step moves. Every step was already at least 8. Round 27 leaves A5 and B4 there: the new mask replaces the whole `message`, `detail`, and `description` (`webMcpDiagnosis.test.ts:329`) and still leaves the value in a sibling or ancestor string. A2 stays 9; trust was not changed.

**Three changes that lift the lowest steps most:**

1. Substitute the sensitive value in every string in the report, including ancestors and siblings, and keep the rest of the sentence. The lookup stays on the declaring object, and three prose keys are replaced wholesale (`webmcp-redaction.mjs:127`, `:171`). That lifts **B4** and **A5**.
2. Render `propertyDiff` as added, removed, and changed rows (`WebMcpToolPanel.tsx:1017`). That lifts **B3**.
3. Show the waiting label in the compact grid switcher (`WebMcpPages.tsx:128`) and stop cutting strip arguments at 140 (`WebMcpCallStrip.tsx:114`). That lifts **A8** and **A3**.
