**One P1 found.** PRD definition-of-done item 3 is not met.

Audited source: `7811c298c824173b9aea537fffb640283deefcee`. In this checkout, `main` and `HEAD` resolve to that same commit, so `git log main..HEAD` is empty. No files were modified.

1. **P1 — Masked tool names lose their identity in manual evidence, replay, and regression exports.**

   **Locations:**
   
   - `desktop/packages/electron/src/desktop-webmcp-browser.js:67` replaces credential-shaped tool names with `[redacted]`, while providing distinct opaque invocation selectors.
   - `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:684` records the displayed name as the journal’s tool identity.
   - `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:1097` selects journal evidence by that displayed name.
   - `desktop/packages/ui/src/lib/webMcpDiagnosis.ts:136` accepts `[redacted]` for export; line 149 generates a lookup using it as the actual registered name.

   **Concrete reproduction:** Register two tools named `token=alpha` and `token=beta`, with the same input schema and different effects. Both appear as `[redacted]`, although their opaque selectors differ. Run the first tool with `{ "item": "from A" }`, then inspect the second tool. Its manual comparison selects the first tool’s journal entry because both displayed names match. Replay likewise uses the displayed name to associate the input. Choose **Copy test**: the snippet searches for `candidate.name === "[redacted]"`, which matches neither registered tool and throws `tool not registered`. The copied `--run` argument has the same incorrect name.

   **User impact:** The UI attributes another tool’s execution evidence to the inspected tool, and the documented regression-export flow produces an unusable test. Replay can also put another tool’s arguments into the selected tool’s form. This meets the supplied P1 definitions for false execution evidence and a broken documented flow.

   **Verification:** A read-only Node probe exercised the actual catalog projection, reproduced the cross-tool journal match, and executed the generated snippet against the original tool catalog; it failed with `tool not registered`. This was a source-level reproduction, not a native Electron journey.

**P2:** No additional independently substantiated P2 findings.

The earlier protections are present in the reviewed source paths: request identity and document checks; cancellation during visibility waits; registration retirement; distinct manual outcomes; export restrictions for uncertain outcomes; redaction before display truncation; origin-only persisted history; conservative eviction and closure; sign-in popup waiting; whole-turn recap collection and copying; and digest-bound approval details. Round 18’s opaque selector protects **manual dispatch**, but the finding above shows that identity does not survive into downstream evidence and export. Main-process ownership checks continue to prevent a pop-out from creating a second browser owner.

**Validation limits:** The checker test files could not start because `vitest` is absent. No dependencies were installed and no native UI journeys were run. Consequently, the earlier fixes received source inspection here, not complete native requalification.

