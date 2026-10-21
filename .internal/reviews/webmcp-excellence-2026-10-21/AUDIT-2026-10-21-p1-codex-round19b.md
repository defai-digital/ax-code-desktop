**Two P1 findings remain at `97dd2b13`. PRD definition-of-done item 3 is not satisfied.** This was a read-only source audit with in-memory reproductions; no files were modified.

1. **P1 — The recap falsely reports an executed tool as “never called.”**

   **Locations:** `desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:88`, `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:1117`, `desktop/packages/ui/src/lib/webMcpCalls.ts:129`.

   **Reproduction:** Register a tool with the dummy credential-shaped name `ghp_abcdefghijklmnop`, then invoke it successfully through the agent. The catalog projects its name as `[redacted]`, while the collected call retains its original name. The recap compares these different representations and includes `[redacted]` among tools never called. The comparison panel likewise fails to find the recorded agent call.

   **Verified result:** The reproduction produced `outcome: "ok"` and a matching native definition digest, but still reported `notCalled: ["[redacted]"]` and no matching agent comparison.

   **User impact:** Both displayed and copied landing evidence contradict the execution record. A supervisor can conclude that an exercised capability was never used, and the documented manual-versus-agent comparison fails for this supported tool-name case. Round 19 fixed manual identity matching, but these consumers still use names.

2. **P1 — Redacted-name collisions attach the wrong definition to registration evidence and conceal schema changes.**

   **Location:** `desktop/packages/ui/src/lib/webMcpCatalog.ts:283`, especially definition selection at lines 293–294.

   **Reproduction:** Register two tools named `ghp_abcdefghijklmnop` and `ghp_qrstuvwxyzabcdef`, with different schemas. Both display as `[redacted]`. Registration maps keyed by that label retain the second tool’s digest, while `.find()` attaches the first tool’s definition. Next, change the second tool’s `value` property from `number` to required `boolean`.

   **Verified result:** Initial registration yielded one event for two tools, with a digest inconsistent with its attached definition. After replacement, the changed event carried the second tool’s new digest but the first tool’s unchanged before/after definitions; its displayed property diff was `[]`.

   **User impact:** Registration evidence combines identities from different tools and hides a real schema change. Builders cannot reliably determine which definition changed or assess its input differences.

**P2:** No separate substantiated findings.

The reviewed source retains the earlier protections around dispatch identity, queued cancellation/navigation, manual stale-form admission, outcome/export restrictions, unsaved-work closure, sign-in waiting, shutdown refusal, and single browser ownership across windows. Round 19’s manual identity separation and original-schema redaction passed targeted in-memory checks. All **8 shared redaction tests passed**, as did targeted checks for schema-diff filtering and empty-catalog checker exit codes.

These findings were reproduced using the current projection, call-collection, and registration helpers. Native Electron journeys and the full UI suite were not run; this audit does not establish native runtime qualification.

