# WX-02 / WX-04 handoff

Branch `wx13-inspect`. Not committed.

The project browser Page tools panel can now be inspected by a builder, and a rejected page catalog is named instead of disconnecting the pane. Hint badges and authoring notes never approve a call. Drafts, the registration timeline, and manual results stay in memory for the current page.

## Behavior

WX-02, Page tools panel:

- An expanded tool shows its full description (whitespace preserved, not sliced below the existing 4096-character transport cap). The collapsed row stays short.
- **Input schema** is collapsed until opened. The raw schema is read-only text (`aria-readonly`, React text, no HTML). A tool with no schema says so. Display text is capped at 32,768 characters.
- Hint badges use `readOnlyHint`, `untrustedContentHint`, and `consequentialHint`. The CDP names `readOnly`, `untrustedContent`, and `consequential` count too. Only an exact `true` boolean becomes a badge. A tool with no hints is not an approval. The panel says hints never approve a call or grant agent access.
- **Form** versus **Script** comes from an integer `backendNodeId` (declarative form). That kind is not stored on the tool the invocation digest is bound to.
- The panel says when the visible list stops, for example "Showing 64 of 65", for the 64-tool cap and the 256 KiB cap. The toggle name stays the number of tools actually listed.
- Per-tool authoring notes cover a name longer than 64 characters, a description longer than 500 characters, a missing tool or property description, opaque enum/const values, and the schema keywords `pattern` and `patternProperties`. Notes are advice. **Try it** still runs. This is not the AX Code runtime schema profile (WX-16).

WX-04, registration truth:

- A rejected `toolsAdded` batch sets `catalogRejection` (`code: "invalid-catalog"`) and leaves the adapter available. Previously accepted tools stay. The pane does not disconnect, and in-flight calls on those tools are not revoked.
- Reasons: `duplicate-name` (two copies of one name in one batch), `invalid-schema`, `invalid-name` (empty or longer than 256; the panel shows at most 64 characters of the name), `invalid-description`, `definition-too-large` (32 KiB), `catalog-too-large` (128 tools or 256 KiB). A later successful batch clears the reason. Navigation clears tools and the reason.
- Replacing one stored name is a definition change, not a duplicate. The invocation digest still includes `frameId`.
- The panel keeps a registration timeline for the current page: added, removed, or changed, with a definition digest. A remove followed by the same digest is a reload and does not add a new row. A different digest is one changed row (previous digest, then the new one).
- A manual result whose tool definition changed is marked stale. The same definition is not. A tool that disappears does not, by itself, mark the stored result stale.
- Form text is kept across a same-definition reload and restored when the tool row is mounted again. A new digest does not restore the old draft.

Definition identity for drafts, staleness, and the timeline excludes `frameId`, so a reload can match. Electron sends a sha256 of that identity. A catalog written straight into the store without a digest uses an FNV-1a fallback.

## Bounds (in memory only)

Nothing in this list is written to `localStorage`. Address history is unchanged.

| What | Bound |
| --- | --- |
| Visible tools | 64 |
| Visible definition bytes | 256 KiB (262,144) |
| Adapter tools / catalog bytes | 128 tools, 256 KiB; a batch past either is rejected, not truncated into an executable catalog |
| One definition | 32 KiB; name 256; description 4,096 |
| Registration events | 32 newest |
| Drafts and manual results | 64 tools each |
| Draft fields | 128 keys, key 256 characters, value 65,536 characters, JSON 65,536 characters |
| Manual result | outcome 64 characters, text 4,000 characters |
| Rejection tool name | 64 characters |
| Schema text in the panel | 32,768 characters |
| Lint walk | 200 schema nodes; up to 8 property names; names string 200 characters |

An origin change and `resetSnapshot` drop the timeline, drafts, and results. `resetSnapshot` still keeps the runtime-compatibility answer.

## English strings

New keys are only in `desktop/packages/ui/src/lib/i18n/messages/en.ts`. No other locale file was edited.

- `webmcp.tools.origin`
- `webmcp.tools.kind.form`
- `webmcp.tools.kind.script`
- `webmcp.tools.hint.readOnly`
- `webmcp.tools.hint.untrusted`
- `webmcp.tools.hint.consequential`
- `webmcp.tools.hintsDoNotApprove`
- `webmcp.tools.schema`
- `webmcp.tools.schemaUnavailable`
- `webmcp.tools.schemaTruncated`
- `webmcp.tools.truncated`
- `webmcp.tools.lint.title`
- `webmcp.tools.lint.advice`
- `webmcp.tools.lint.nameLength`
- `webmcp.tools.lint.descriptionLength`
- `webmcp.tools.lint.missingDescription`
- `webmcp.tools.lint.missingPropertyDescription`
- `webmcp.tools.lint.opaque`
- `webmcp.tools.lint.rejectedKeyword`
- `webmcp.tools.rejection.title`
- `webmcp.tools.rejection.unnamed`
- `webmcp.tools.rejection.duplicate-name`
- `webmcp.tools.rejection.invalid-schema`
- `webmcp.tools.rejection.invalid-name`
- `webmcp.tools.rejection.invalid-description`
- `webmcp.tools.rejection.definition-too-large`
- `webmcp.tools.rejection.catalog-too-large`
- `webmcp.tools.registration.title`
- `webmcp.tools.registration.added`
- `webmcp.tools.registration.removed`
- `webmcp.tools.registration.changed`
- `webmcp.tools.resultStale`

`loadDictionary` throws `Invalid language catalog` when a locale JSON does not have every English key. `applyPreferences` then sets the whole UI back to English (`loadingError`). `pnpm run check:locales` will fail until those keys are translated. This handoff does not add those translations.

## Files

- `desktop/packages/electron/src/native-webmcp.js`
- `desktop/packages/electron/src/native-webmcp.test.mjs`
- `desktop/packages/electron/src/desktop-webmcp-browser.js`
- `desktop/packages/electron/src/desktop-webmcp-browser.test.mjs`
- `desktop/packages/ui/src/lib/webMcpCatalog.ts` (new)
- `desktop/packages/ui/src/lib/webMcpCatalog.test.ts` (new)
- `desktop/packages/ui/src/lib/webMcpToolLint.ts` (new)
- `desktop/packages/ui/src/lib/webMcpToolLint.test.ts` (new)
- `desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts`
- `desktop/packages/ui/src/stores/useWebMcpBrowserStore.test.ts`
- `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx`
- `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.test.tsx`
- `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx`
- `desktop/packages/ui/src/lib/i18n/messages/en.ts`
- `docs/webmcp-page-tools.md`

## Mutation probes

- Rejected keywords: `desktop/packages/ui/src/lib/webMcpToolLint.test.ts`. Dropping `pattern` or `patternProperties` from `WEBMCP_REJECTED_SCHEMA_KEYWORDS` fails. Treating a property named `pattern`, or `format`, as a rejected keyword also fails.
- Stale results: `desktop/packages/ui/src/stores/useWebMcpBrowserStore.test.ts`. A changed description marks the previous result stale and keeps its digest. The same definition does not. Removing the tool does not.
- Named catalog rejection: `desktop/packages/electron/src/native-webmcp.test.mjs`. A duplicate name, an array schema, a 300-character name, and a cyclic schema each keep `available === true`, keep the previously accepted tool, and set `catalogRejection` with the tool name (sliced to 64 characters for the long name). A one-tool replacement clears the rejection.

## Verification

- `pnpm run typecheck` passed (Electron runtime syntax, 201 files; UI `tsc --noEmit`; web `tsc --noEmit`). UI `tsc --noEmit` was run again after the final `en.ts` edit and passed.
- `pnpm run lint` passed.
- UI Vitest passed: `WebMcpToolPanel.test.tsx`, `webMcpToolLint.test.ts`, `webMcpCatalog.test.ts`, `useWebMcpBrowserStore.test.ts`, `EmbeddedWebMcpBrowser.test.tsx` (70 tests). An earlier run of those files plus `WebMcpBuilderHint.test.tsx` also passed (72 tests) before the last store typing edit; the builder hint was not changed after that.
- Electron Vitest passed: `native-webmcp.test.mjs`, `desktop-webmcp-browser.test.mjs` (76 tests).

No packaged desktop session was opened. The panel is covered by the component tests above. `pnpm run check:locales` was not run; it is expected to fail for the reason in the English-strings section.
