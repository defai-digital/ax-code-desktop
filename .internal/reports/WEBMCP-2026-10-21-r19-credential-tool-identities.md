# R19 credential-shaped tool identity closure

Base: `97dd2b13`. Worktree: `r19-audit`. Changes remain uncommitted.

## Implementation

The Electron view owns a registry mapping the native origin/name pair to a random opaque invocation ID and a stable display label. Credential-shaped names receive distinct labels in first-appearance order: `[redacted tool 1]`, `[redacted tool 2]`, and so on. Labels and opaque IDs survive catalog reorder, removal/re-registration, and schema edits within the view. Native definition digests continue to bind the exact definition, including the frame.

The shared main-process catalog projection supplies each definition's opaque ID and native digest together. Renderer consumers resolve runtime receipts by that native digest against these main-issued bindings and retained registration definitions; they never join on the runtime name or displayed label. Missing or ambiguous bindings remain unmatched. This uses the catalog-binding option requested in the task, without adding an IPC command.

Registration continuity uses the opaque ID and stores the actual before/after definition objects. Definition-specific evidence and manual drafts/results/replay use the ID plus native digest. Recap calls resolve that pair before aggregating by opaque tool ID: a call on a known earlier definition still counts as called, with a separate changed-definition badge. Comparison uses the opaque ID to select the same tool's last agent call, then the digest to select its historical schema. Approval hints require a current digest-bound definition within the matching session and origin. Approval display text, the call strip, and recap use the corresponding stable label.

Manual dispatch now accepts only the opaque invocation ID and retains the existing origin, generation, and digest checks. Real-name and digest-as-ID fallbacks are removed. Runnable regression exports reject both legacy and numbered redaction placeholders.

No changes to accepted PRDs, ADRs, runtime policy, grants, publication state, or signed runtime pins.

## Regressions

Two tools named with dummy credential shapes have distinct schemas. Tests cover:

- Two initial registration events, with each event's digest matching its attached definition.
- Stable IDs/labels after reverse ordering and a change to the second tool from optional number to required boolean.
- A nonempty property diff for that second tool and stale evidence for its earlier definition.
- One successful agent call attributed only to its main-issued key, including historical digest resolution.
- Correct recap count, called/never-called labels, and copied evidence without the real names.
- Comparison attached only to the invoked tool.
- The call strip's stable label and approval lookup/description/required fields for the correct tool.
- No name fallback for missing identities, ambiguous digests, or manual dispatch.
- No runnable export for numbered redacted placeholders.

The new native scenario extends `project-browser-tasks.mjs` after the existing W3/W4/W6/W8 measurements. It registers two real native tools, invokes the first through the scripted runtime bridge, changes the second schema, and checks fresh renderer evidence for recap, call strip, registration/property diff, and comparison. It does not alter the original action budgets.

## Remaining name comparisons and maps

Audit command:

```sh
rg --files desktop/packages/ui/src desktop/packages/electron desktop/shared |
  rg -i 'webmcp' | rg -v '\.test\.' |
  xargs rg -n '(\.name\s*===|\[\s*(tool|candidate|definition|entry)\.name|\.(get|set|has)\([^)]*\.name)'
```

Supplemental inspection covered `new Map`, `toolName ===`, `ReviewLandingBrowserEvidence.tsx`, `PermissionCard.tsx`, native request lookups, and `project-browser-tasks.mjs`.

There are no remaining production WebMCP evidence maps keyed by a displayed tool name. Every remaining matching site is listed below; paths are relative to `desktop/`.

| Site | Why safe |
| --- | --- |
| `packages/ui/src/components/mcp/WebMcpToolPanel.tsx:650` | Matches an exact execution-schema property to its validation finding, not a tool label. |
| `packages/ui/src/lib/webMcpToolForm.ts:161` | Matches raw execution-schema property keys when loading input. |
| `packages/ui/src/lib/webMcpBridgeCoordination.ts:32` | Detects the configured MCP bridge server named `webmcp`; not a page-tool catalog join. |
| `packages/ui/src/lib/webMcpDiagnosis.ts:150` | Generated standalone native-page regression code, only for unredacted tool names. Both legacy and numbered redaction placeholders are refused before generation. |
| `shared/webmcp-catalog-projection.cjs:38,44` | Main-only registry keyed by the original origin/name pair; converts it to opaque identity and stable label before renderer projection. |
| `shared/webmcp-catalog-projection.cjs:56` | Main-only lookup of native form/script kind by the original protocol name. |
| `packages/electron/src/desktop-webmcp-browser.js:1353` | Resolves an opaque manual invocation ID against the main-only original-name registry. The caller's value is compared only to the opaque ID. |
| `packages/electron/src/native-webmcp.js:275,288,289,323,327` | Native protocol registration/kind maps and dispatch validation use original names, with frame/generation/origin/native digest checks. No displayed names enter these maps. |
| `packages/electron/scripts/webmcp-check-entry.cjs:85,87,126` | Standalone checker tracks native registrations and invokes native definitions by original name before report redaction. |
| `packages/electron/scripts/webmcp-check-lib.mjs:92,94` | Validates keyed identity/input receipts, or original in-memory names and exact inputs, before report/option redaction. No redacted report names are used for correlation. |
| `packages/electron/scripts/probe-native-webmcp.cjs:140,145,192,202,207,215` | Qualification fixtures compare fixed original native tool names, never catalog display projections. |
| `packages/electron/scripts/probe-native-webmcp.cjs:298` | Looks up a fixed fixture DOM outline node, not a tool. |
| `packages/electron/scripts/e2e/ui-webmcp-client.mjs:23` | Maps fixed allowlisted Desktop development tool names within the selected frame. These are native API names, not page-supplied display labels. |
| `packages/electron/scripts/e2e/ui-webmcp-client.mjs:106,120` | Finds the fixed Search settings UI control by accessible name. |
| `packages/electron/scripts/e2e/settings-webmcp.mjs:52` | UI automation resolves a control by accessible name and role; tool invocation uses the native client binding. |
| `packages/electron/scripts/e2e/config-editors-webmcp.mjs:42,43` | Fixed accessible control labels in a settings journey. |
| `packages/electron/scripts/e2e/hooks-targets-webmcp.mjs:53` | Fixed project selector label in a settings journey. |
| `packages/electron/scripts/e2e/supervision-workspace-webmcp.mjs:119,364` | Accessible control lookup and fixture row uniqueness checks, not page-tool identity. |
| `packages/electron/scripts/e2e/mcp-create-webmcp.mjs:48` | Fixture MCP server inventory, not page tools. |
| `packages/electron/scripts/e2e/mcp-delete-webmcp.mjs:108` | Checks the fixture MCP server inventory after deletion. |
| `packages/electron/scripts/e2e/project-browser-tasks.mjs:173,188` | Fixed non-sensitive quickstart fixture tool names. The new credential regression uses main-issued IDs and native digests for cross-version assertions. |

Other reviewed maps use project/view IDs, request/call IDs, native identity pairs, or opaque invocation IDs.

## Validation

- Focused UI: 31 files, 466 tests passed.
- Electron browser controller and native adapter: 2 files, 230 tests passed.
- Shared redaction: 8 tests passed.
- `pnpm run typecheck`: passed.
- `pnpm run lint`: passed.
- `node --import tsx script/check-desktop-boundaries.ts --fail-on-violation`: passed.
- `pnpm run check:desktop-ipc-contracts`: passed (43 invoked commands, 59 handlers/manifest commands).
- `pnpm run build`: passed.
- `project-browser-tasks.mjs`: passed on the final build, including the new two-credential-tool regression. W3 3/12 actions, W4 3/10, W6 3/8, W8 13/15. CSP clean; no uncaught renderer exceptions.
- `project-browser-webmcp.mjs`: passed on the final build. W1 5 actions, W2 5, W5 pause/resume and ownership continuity, W7 7/12 plus 50 switches with bounded heaps/listeners. CSP clean; no uncaught renderer exceptions.
- `git diff --check`: passed.

The first extended native run passed the original task measurements, then correctly held the added agent invocation while Review changes had selected Preview. The journey now explicitly restores the Project browser tab before the added invocation. No visibility/admission safeguard was weakened. A second journey refinement waits for the renderer to observe the original two-tool catalog before changing its schema, so the polling-based registration history has both versions to compare.

New `en.ts` strings: none. No English localization fallbacks were added. Numbered redaction labels are main-issued security placeholders, not fallback UI prose.

This is local Desktop implementation/validation evidence. The native task runtime is scripted; this record does not claim signed-runtime qualification, three-platform CI, publication, or independent completion of every PRD definition-of-done item.

## Local validation artifacts

- Final native task log: `/tmp/r19-native-tasks-qualified.log`.
- Task receipts/screenshots: `/tmp/r19-credential-native/tasks-qualified/`, including `credential-identities.json` and `credential-identities.png`.
- Native browser journey log: `/tmp/r19-native-webmcp.log`.
- Browser journey receipts/screenshots: `/tmp/r19-credential-native/webmcp/`.
- Focused UI: `/tmp/r19-focused-final.log`; Electron/native adapter: `/tmp/r19-electron3.log`; redaction: `/tmp/r19-redaction.log`.
- Final typecheck/lint/build: `/tmp/r19-typecheck-final.log`, `/tmp/r19-lint-final.log`, `/tmp/r19-build4.log`.

HEAD remains `97dd2b13`; no changes are staged or committed.
