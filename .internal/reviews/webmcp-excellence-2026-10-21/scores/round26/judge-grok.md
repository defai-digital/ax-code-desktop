I'll judge round 26 from source only: the PRD bar, prior ballots, and the WebMCP paths at `92775899`. No files will be changed.HEAD is `96f74a34` (round 26). `92775899` is an older ancestor, so I will score the current WebMCP source and check each round-26 claim in the files.**Round 26 at `96f74a34`.** Source judgment of `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. `92775899` is a round-15 ancestor. v7.28.2 sends `definitionDigest` and a redacted `inputPreview` on approval metadata (`desktop_webmcp.ts:225-227`). Desktop renders that shape. Tests and native journeys were not run.

Verified in `cb182998`: the collapsed row and the call strip share a redacted reason and the first finding (`webMcpFailureSummary.ts:12`, `ToolPart-impl.tsx:1687`, `WebMcpCallStrip.tsx:151`). Replay keeps an off-list enum value, and the first click only arms confirm (`WebMcpToolPanel.tsx:361`, `:628`). Compare names a missing digest, an unmatched digest, or a missing input (`:328`). Mission Control shows a per-row waiting chip (`MissionControlRow.tsx:283`). A grid pane opens its page with the grid kept (`SessionGrid.tsx:289`, `MainLayout.tsx:535`). The thrown init error names the stage (`native-webmcp.js:153`). The banner stores `start-failed` (`EmbeddedWebMcpBrowser.tsx:269`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Origin, hints, schema, a truncation notice, and a named rejection stay inside one collapsed catalog (`WebMcpToolPanel.tsx:972`). |
| A2 enable and scope trust | 9 | One disclosure shows origin, project, session, and access, with per-session revoke and project sign-out (`WebMcpPages.tsx:167`). |
| A3 watch live | 8 | The strip shows the outcome, a digest, a result, and the new failure line, with arguments cut at 140 characters (`WebMcpCallStrip.tsx:112`). |
| A4 approvals | 8 | The card builds the effect from call data and shows one digest. A vanished ask is recorded as unanswered (`PermissionCard.tsx:407`, `useWebMcpApprovalOutcome.ts:25`). |
| A5 failure recovery | 8 | A failed call shows its redacted reason and first finding before expand. Init failures still reach the person as a generic start failure (`ToolPart-impl.tsx:1687`, `EmbeddedWebMcpBrowser.tsx:269`). |
| A6 evidence after the task | 8 | The recap copies the outcome, duration, digest, rejections, and never-called tools, and leaves arguments off the copy (`ReviewLandingBrowserEvidence.tsx:91`). |
| A7 pause and take over | 8 | Pause is separate from disconnect, keeps the page, and reports stopped or still finishing within the bounded acknowledgement (`native-webmcp.js:11`). |
| A8 several sessions | 8 | Each row has a waiting chip and each grid pane can reveal its page in place. The compact pane omits revoke, and one shared panel shows one page (`MissionControlRow.tsx:283`, `WebMcpPages.tsx:129`). |
| B1 see registered tools | 8 | Kind, hints, schema, advisory lint, and a named catalog rejection are inspectable on the same collapsed surface (`WebMcpToolPanel.tsx:399`, `:982`). |
| B2 try and compare | 8 | Off-list replay stays visible and requires a second click. Compare states why a runtime receipt is missing (`WebMcpToolPanel.tsx:628`, `:328`). |
| B3 iterate | 8 | Registration history, retained drafts, and stale results remain. The property diff is still one JSON blob (`WebMcpToolPanel.tsx:1017`). |
| B4 diagnose misuse | 8 | Diagnosis names property, rule, and value kind against the retained digest. A call with no receipt is explained and is left without invented arguments (`webMcpDiagnosis.ts:231`). |
| B5 onboarding docs | 8 | The guide covers registration through export and states the v7.28.2 receipt limits (`docs/webmcp-page-tools.md:305`). |

**Means:** A **8.13** (65/8). B **8.00** (40/5).

**Movement.** Against this judge's round-24 ballot, **A5 moves 7→8**. Against the recorded round-25 ballots (A5 8/7/7, B2 7/8/7), the collapsed-row gap behind those A5 scores of 7 is closed, and the off-list submit hole behind those B2 scores of 7 is closed. This ballot scores both **8**. No other step moves. A8 stays 8.

**Three changes that lift the lowest steps most:**

1. Show the stage already in the thrown init error on the banner, and list every finding on the collapsed row and the strip. The banner keeps `start-failed` (`EmbeddedWebMcpBrowser.tsx:269`), and the summary keeps `findings[0]` (`webMcpFailureSummary.ts:12`). That lifts **A5**.
2. Render `propertyDiff` as rows of property, change, and before/after (`WebMcpToolPanel.tsx:1017`). That lifts **B3**.
3. Record a visible timeout and a denied state in place of the pending/unanswered pair (`useWebMcpApprovalOutcome.ts:6`). That lifts **A4**.
