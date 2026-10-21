**Audit result: 3 P1 findings. DoD item 3 does not pass.**

Audited the requested current source at `92775899b8a56fb0f67ca3f2ddecf96700207546`, against the controlling PRD and round 14 audit. Method: source inspection plus disk-free Node reproductions using synthetic inputs. Native UI journeys were not run. No files were modified; the specified runtime-update changes were excluded.

1. **P1 — Regression exports expose credentials nested inside arrays.**  
   Location: [desktop/packages/ui/src/lib/toolHelpers.ts:332](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:332), rendered by [WebMcpToolPanel.tsx:154](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:154).

   **Reproduction:** Run a manual tool with `{"accounts":[{"password":"synthetic-secret"}]}`, then inspect its generated test or choose **Copy --run argument**. `placeholderWebMcpSecrets()` traverses objects but explicitly skips arrays. The generated snippet and command retain the password verbatim, although the journal’s input preview correctly redacts it. Credential-shaped strings inside arrays also survive.

   **Impact:** Credentials leak onto the export surface and clipboard, and can subsequently enter test files or shell history. Confirmed by executing the current redaction and export functions in memory.

2. **P1 — The headless checker reports success after an abnormal exit leaves requested runs unfinished.**  
   Locations: [desktop/packages/electron/scripts/webmcp-check.mjs:53](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/webmcp-check.mjs:53), [webmcp-check-lib.mjs:88](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/webmcp-check-lib.mjs:88).

   **Reproduction:** Start `webmcp:check` with an expected registered tool and a slow `--run`; terminate the Electron child after catalog discovery saves its report but before the run finishes. The launcher accepts the partial report despite the abnormal exit. Evaluation checks only recorded runs, without verifying that every requested run exists.

   **Impact:** CI receives exit code **0**, no problems, and an empty or incomplete run list—falsely certifying checks that never completed. A disk-free simulation executing the current launcher with child exit **137** and `runs: []` reproduced exit code **0**.

3. **P1 — Exported regression tests fail against unchanged, correctly recorded error outcomes.**  
   Location: [desktop/packages/ui/src/lib/webMcpDiagnosis.ts:142](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/webMcpDiagnosis.ts:142).

   **Reproduction:** Register a tool returning `{"status":"failed"}`. Run **Try it**, which correctly records `application-error`, then execute **Copy test** against the unchanged tool. The generated classifier ignores `status: "failed"` and computes `completed`, throwing `expected outcome application-error`. The same mismatch occurs with `errorText`; whitespace-padded timeout statuses also fail.

   **Impact:** The documented journal-to-regression-test flow produces failing tests without any behavioral regression. Confirmed by executing generated snippets against synthetic model contexts. This meets the supplied P1 criterion for a documented flow that does not work.

**P2 findings:**

- [desktop-webmcp-browser.js:688](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:688): Adapter failures still collapse into generic `Error`, discarding reasons such as `definition-changed` and `page-changed`. Transcript and recap diagnosis remains incomplete.
- [WebMcpApprovalToolInfo.tsx:38](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/WebMcpApprovalToolInfo.tsx:38): Approval details select the current catalog by session, origin and name, without matching the requested definition digest. Re-registration during an outstanding approval can display a different definition.
- [docs/webmcp-page-tools.md:105](/Users/akiralam/code/ax-code-desktop/docs/webmcp-page-tools.md:105): Visibility recovery documentation describes a separate **Resume agent access** step, while the current bridge wakes eligible waiting requests when the page becomes visible.

No additional P1 was established in the inspected cancellation or session-grid single-browser-owner paths.

