# Embedded Native WebMCP Feasibility, 2026-10-11

Status: Research complete on macOS arm64; production integration and paired governance acceptance pending.

## Result

AX Coder can provide native Chrome-standard WebMCP through its bundled Electron engine without
using an installed Chrome executable. A dedicated `WebContentsView` in Electron 44.7.0 / Chromium
152.0.7977.130 passed imperative and declarative discovery/invocation in two independent processes.
Tool removal and empty-document cleanup also passed. The current Electron 42.5.2 / Chromium
148.0.7778.271 did not provide the required CDP domain, even with its legacy page API enabled.

| Engine | Native feature switch | Page API | Native smoke |
| --- | --- | --- | --- |
| Electron 42.5.2 / Chromium 148 | Off | Absent | Expected unavailable |
| Electron 42.5.2 / Chromium 148 | On | Legacy navigator.modelContext | Expected unavailable: WebMCP.enable not found |
| Electron 44.7.0 / Chromium 152 | Off | Absent | Expected unavailable |
| Electron 44.7.0 / Chromium 152 | On | document.modelContext | Pass |
| Electron 44.7.0 / Chromium 152 | On, separate process | document.modelContext | Pass |

Each record is checked into this report directory. `harness/verify-evidence.mjs` checks both successful
results and all negative controls. Native capability diagnostics exit successfully when the probe ran;
`--probe-expect-native` additionally requires the native smoke to pass.

## Scope and limitations

The probe uses native registration and the CDP WebMCP domain, without a polyfill, extension,
Chrome executable discovery, external browser process, or remote debugging port. It loads only a
controlled HTTP loopback fixture in a sandboxed guest with Node integration disabled and a disposable
profile. Fixed JavaScript evaluation inspects that fixture only. The probe is never loaded by the app.

The form fixture uses automatic submission. Manual submission, user interaction, cancellation,
hostile pages, cross-origin frames, permission authority, and AX Code dispatch remain unqualified.
The hidden research window does not establish visible production browser UX or accessible layout.
No Windows/Linux/x64, packaged Chrome-free machine, signing, upgrade, or rollback test was run.
The test avoided installed Chrome; it did not remove Chrome or prove this host has none installed.

Electron printed `sandbox_extension_issue_file_to_process ... Operation not permitted` on macOS for
the unpackaged research app. The guest had `sandbox: true` and no Node visibility; this probe does
not independently attest OS sandbox enforcement. Signed packaged sandbox qualification is pending.

`productionQualified` is false in every record. These are native observations, not AX Code receipts,
an installed release, a published release, or proof that the pinned worker can use this browser.

## Provenance and workspace preservation

- AX Coder HEAD at initial inspection: `3ec3e9577bd522baec2383182d1b966a59734ee6`.
  Concurrent user work advanced it to `0984a9ce49b8719187a79f2b9f2fca9b863110f2` during this research.
- Read-only AX Code source HEAD: `5440434dafdf4acfb256fdae3d03b75b8ac23197`.
- Current SDK: `2.6.7`; current signed runtime pin: `7.10.2`.
- `git show v7.10.2:packages/ax-code/src/mcp/webmcp-profile.ts` confirms that module is absent in the
  pinned runtime's tagged source. Current sibling source does not qualify the older packaged worker.
- Candidate archive: `electron-v44.7.0-darwin-arm64.zip`, downloaded through the workspace's
  `@electron/get@5.1.0`, whose default checksum validation was not disabled.
- Observed archive SHA-256: `e04e411b58a0a14375dd21b0ab4a378fd38930a702e4e20e322fee4849404c0b`.
- Candidate extracted to a unique OS temporary directory; no dependency or runtime pin was changed.
- Existing dirty renderer, runtime-recovery, lockfile, and reference-source work was preserved.
  No sibling files, accepted governance records, production source, or release policy were modified.

## Reproduction

Run from the AX Coder repository with its installed dependencies. macOS baseline:

```sh
env -u ELECTRON_RUN_AS_NODE \
  desktop/packages/electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  .internal/reports/webmcp-native-2026-10-11/harness/probe.cjs --probe-webmcp \
  --probe-output=/tmp/ax-coder-webmcp-baseline.json
```

For the candidate, use the absolute path to the separately extracted Electron 44.7.0 executable
instead of the workspace executable and add `--probe-expect-native`. Keep candidate binaries outside
the repository. Omit `--probe-webmcp` to obtain the disabled control. The probe creates a disposable
profile and loads its own loopback fixture; do not point it at user websites or application profiles.

```sh
node --check .internal/reports/webmcp-native-2026-10-11/harness/probe.cjs
node .internal/reports/webmcp-native-2026-10-11/harness/verify-evidence.mjs
```

## Review package and next production gate

- [Product requirements](../../prd/PRD-2026-10-11-embedded-native-webmcp-v1.md)
- [AX Coder ADR-009](../../adr/ADR-009-embedded-native-webmcp-provider-v1.md)
- [AX Code producer ADR draft](../../adr/proposals/AX-CODE-ADR-PROPOSAL-2026-10-11-embedded-webmcp-transport-v1.md)
- [Technical contract and acceptance matrix](../../spec/SPEC-2026-10-11-embedded-native-webmcp-v1.md)

AGENTS.md requires accepted PRD, accepted ADRs in each affected repository, technical specifications,
and implementation evidence in that order. The review package is proposed, not accepted. The next
production step requires acceptance of these concrete documents, followed by the producer-first
contract/SDK/signed-worker implementation. No permission-engine duplication or unsigned fallback.

## Primary references, checked 2026-10-11

- [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp/)
- [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Agent security](https://developer.chrome.com/docs/agents/security)
- [Tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Native CDP domain](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/WebMCP.pdl)
- [Electron 44.7.0 identity](https://releases.electronjs.org/release/v44.7.0)
- [Electron embedded surface guidance](https://www.electronjs.org/docs/latest/api/webview-tag)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)

WebMCP remains an evolving experimental standard. Compatibility is scoped to the tested engine and
native API revision; a higher version number alone is not an acceptance gate.
