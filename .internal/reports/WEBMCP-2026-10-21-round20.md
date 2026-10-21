# WebMCP round 20 implementation and local verification

Base: `f06cea02`. Changes remain uncommitted. Runtime and SDK pins are unchanged.
Controlling record: `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md`.

## Changes

- WX-05/WX-07/WX-13: retain only redacted permission `definitionDigest` and `inputPreview`, scoped by session and tool call ID, in a non-persisted cache of at most 256 receipts. Preview retention is capped at 65,536 characters plus an explicit UTF-8 byte truncation marker. Both accepted permission snapshots and permission events capture receipts. Completed transcript calls, comparison, call strip and recap consume them after approval removal.
- B4: validate complete retained manual input or parsed agent preview against the digest-named retained definition. Never substitute the current definition when the invoked definition is unavailable. Preserve explicit truncated-preview and redacted-value gaps. Shared rendered diagnosis is available in expanded transcript parts, comparison and recap.
- WX-03: extract bounded runtime/page rejection details from metadata, output envelopes, validation arrays and reason text. `instancePath`, `path` and `field` identify the failing property; supported keywords use the existing diagnosis vocabulary. Unknown reasons remain redacted text. Manual journal entries retain these details before output display shortening.
- Round 19d P1 redaction: sensitive names propagate to values in `[name, value]`, `{name, value}` and `{key, value}` representations, including nested JSON strings. Input, output and export projections apply the shared redactor first.
- Round 19d P1 draft retention: null-prototype records retain all accepted field names and explicit-empty flags, including `__proto__`, `constructor` and names beyond 256 characters. Existing field/value bounds produce a visible retained truncation notice.
- Updated `docs/webmcp-page-tools.md`. Added three catalog keys in English and all 13 other packaged locales. Locale loader behavior is unchanged; no English fallback was added.

## Verification

- Focused UI tests: 271 passed. Includes receipt lifetime/isolation/eviction, truncation, full-length diagnosis, missing definitions, structured runtime property errors in transcript/compare/recap, entry-pair redaction, arbitrary field names and draft remounts. All new rendered UI tests use `src/test/dom.tsx`; no source-text tests were added.
- Full UI suite: 650 files, 4,777 tests passed. After the final UTF-8 receipt-marker adjustment, the five receipt tests passed again and the final application build passed.
- Shared redactor: `node --test desktop/shared/webmcp-redaction.test.mjs` — 9 passed.
- Electron checker/redaction suites: 27 passed.
- `pnpm run typecheck` — passed.
- `pnpm run lint` — passed; Electron lint passed again after the final native capture adjustment.
- `node --import tsx script/check-desktop-boundaries.ts --fail-on-violation` — passed.
- `pnpm run build` — passed on final application source.
- `git diff --check` — passed.

## Native Electron journeys

`project-browser-tasks.mjs` passed with artifacts at `/tmp/r20-native-tasks`:

- W3: 3/12 actions.
- W4: 3/10 actions. The fixture removes digest/input from completed metadata, retaining those fields only on approval metadata, matching the pinned v7.28.2 contract. The call strip must still show the approved input and digest.
- W6: 5/8 actions, including opening and scrolling the recap for visible evidence. Structured rejection is displayed beside diagnosis. `/tmp/r20-native-tasks/w6.png` was visually inspected and shows `Runtime rejection: text · minLength · W6 controlled page failure`.
- W8: 13/15 actions.
- CSP and uncaught-renderer-error checks passed.

`project-browser-webmcp.mjs` passed with artifacts at `/tmp/r20-native-webmcp`:

- W1: four tools discovered in five actions.
- W2: manual application error and success in five actions.
- W5: keyboard pause/resume retained page, address and result.
- W7: two projects, isolated storage/pages, hidden-call waiting, scoped revoke, second-window ownership, 7/12 actions and 50 bounded switches.
- CSP and uncaught-renderer-error checks passed.

These are native Desktop journeys against the scripted runtime fixture. The scripted approval expiry does not qualify the signed runtime's timer. This work does not claim new judge scores, a fresh independent audit, signed release qualification or publication.

## New English strings

- `webmcp.tools.diagnosis.definitionUnavailable`: `Definition no longer available; the current schema was not used.`
- `webmcp.tools.diagnosis.runtimeRejection`: `Runtime rejection: {reason}`
- `webmcp.tools.draftLimit`: `Draft retention limit reached (128 fields, 65,536 characters per value or JSON input). Only the bounded draft can be restored.`
