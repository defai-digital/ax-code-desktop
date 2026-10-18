# Supervision usability v2 and Streamlit preview evidence

This change makes cross-session approval outcomes explicit, fixes reproduced narrow Peek overflow, and adds an explicit Streamlit recipe to Project Actions. React remains the AX Code Desktop control surface. Streamlit runs as the user's project application through the existing terminal and ordinary preview.

Authorization and acceptance are recorded in [the additive v2 PRD](../../prd/PRD-2026-10-18-supervision-usability-v2-streamlit-preview.md). The accepted v1 PRD is unchanged. Base commit: `d1e538df7496f48a2fa985ef2becb2997aa8f14a`. [Environment](environment.json) and [source inventory](source-inventory.json) identify the local candidate. No push, publication, updater, runtime pin, or release identity change is part of this work. The unrelated `.internal/reference/README.md` change is excluded from the commit.

## Result and implementation

- **Request decisions:** explicit Allow once; polite inline sending, accepted, checking, retry, resolved, and uncertain states. A shared ephemeral record prevents conflicting activation across cards and remounts. Successful replies stay locked; failed replies use the same captured SDK client/directory for a read-only canonical list. Event revisions invalidate a racing read. No auto-retry, canonical-store overwrite, or call to the auto-accepting resync helper was added.
- **Mission Control:** real Peek padding caused a 24 CSS-pixel card at a 210 CSS-pixel viewport (420-pixel window at 200% zoom). Container-responsive padding, wrapping controls, and long-word wrapping remove the measured overflow. Both densities, disclosure, six state enums, navigation, evidence, and working-set behavior remain intact.
- **Copy and discoverability:** review means “Changes to review,” not successful testing or approval. The existing inspector toggle always displays Tools; existing preferences and Escape/focus behavior remain. All 14 catalogs are complete.
- **Streamlit recipe:** Project settings → Actions → Streamlit action. Choose an existing Python interpreter, `.py` file, and port; add and save the action, then explicitly start it. The generated command binds `127.0.0.1`, runs headlessly, and preserves Streamlit CORS/XSRF defaults. No dependency installation, Python distribution, project discovery, or agent-browser grant is added.
- **Readiness and lifetime:** the recipe waits for the configured origin on a Streamlit startup URL line. Command echo, unrelated URLs, and occupied-port output do not open a preview. A 15-second deadline presents a visible preview-unavailable state; later matching readiness can recover it. Existing load-failure Retry/Open in browser controls remain. Manual action URLs open after successful input delivery and cannot reopen a previous project after a directory switch. Start/Stop retain existing terminal ownership; hiding preview does not stop the server.

## Native UI evidence

[Measurements](ui/measurements.json) cover 24 cases: 420/760/1440 content widths × 100%/200% Electron zoom × comfortable/compact density × English/German. The harness mounts actual MissionControlHeader, Row, Peek, RequestActionCard, WorkspaceNavigation, and InspectorRail. Only runtime request transport and supervision lookup are fixture boundaries; request state, DOM, CSS, and native key dispatch are real.

Every case passed Peek/card overflow checks, Tab focus visibility and hit-testing, Return submission with accepted decision lock, eight labeled inspector controls, and Escape collapse with focus restoration. Expanded inspector labels overlay the workspace at narrow widths, preserving the existing responsive behavior. Tall content remains vertically scrollable; this is not a user study or a claim that a 210 CSS-pixel workspace is comfortable for extended use.

Representative screenshots: [wide overview](ui/1440-zoom-1-en.png), [narrow English](ui/420-zoom-1-en.png), [200% long translation](ui/420-zoom-2-de.png), [narrow inspector](ui/420-inspector.png), and [native keyboard focus at 200%](ui/keyboard-focus.png). The [baseline measurements](baseline/measurements.json) record the reproduced overflow before the padding fix.

## Native Streamlit evidence and limits

[Receipt](streamlit-native/receipt.json) and [screenshot](streamlit-native/alpha.png) use actual DesktopBrowserPane, Electron 44.9.0, macOS 27.0.1 arm64, CPython 3.12.13, and Streamlit 1.66.0. The disposable test environment is described by [requirements.lock](streamlit/requirements.lock); it is not an application dependency.

The smoke imports production `attachDesktopBrowserWebviewPolicy`, uses the ordinary `persist:openchamber-browser` partition, keeps sandbox/context isolation/web security enabled, and grants only the ordinary fullscreen permission. Agent Browser is disabled. The actual recipe helper supplies the command executed by the fixture's owned zsh process. The smoke verifies:

| Interaction | Observed result |
| --- | --- |
| Widget and submitted form | Round trips passed |
| Streaming | Intermediate and complete updates observed |
| File upload | Contents round-tripped and SHA-256 matched in both projects |
| Download | Downloaded bytes matched the fixture |
| Reload | Reconnected; Streamlit session state reset |
| Restart | Widget interaction recovered after server restart |
| Two projects | Correct app/port routing; same-host cookie sharing observed |
| Port collision | Second process exited 1; launcher regression proves no premature preview |
| Hide preview | Server health remained available |
| Offline URL | Existing Retry and Open in browser controls displayed |
| External fallback | Correct external-open request observed and intercepted |

The upload driver supplies the file selection through Electron's debugger, and the download handler supplies the destination normally chosen in a native dialog. This proves transport and content round trips, not native file-picker interaction. External-open interception does not prove operating-system browser dispatch. The fixture's process launcher is a test driver, not a replacement for Project Actions; launcher ownership/readiness is covered separately by component regressions.

The ordinary profile is shared, including same-host cookies across ports. It is not a per-project authentication boundary. Private remote deployments, third-party components, authentication providers, reverse proxies, Windows/Linux native behavior, signed installation, upgrade, and rollback were not qualified. The generated shell dialect is explicitly limited to sh/bash/zsh; unsupported shells fail before command submission. Manually attached servers have no action-owned process and remain outside Start/Stop ownership.

## Reproduction

Run from the repository root with the workspace dependencies already installed. Native smoke is opt-in and is not part of default `pnpm test`.

```sh
node .internal/reports/supervision-streamlit-2026-10-18/harness/build.mjs
AX_UIUX_ASSERT=1 AX_UIUX_EVIDENCE=/tmp/ax-code-ui-evidence pnpm --filter @ax-code/electron exec electron "$PWD/.internal/reports/supervision-streamlit-2026-10-18/harness/measure.cjs"

uv venv --python 3.12.13 /tmp/ax-code-streamlit-review-venv
uv pip install --python /tmp/ax-code-streamlit-review-venv/bin/python -r .internal/reports/supervision-streamlit-2026-10-18/streamlit/requirements.lock
AX_PREVIEW_FIXTURE=1 node .internal/reports/supervision-streamlit-2026-10-18/harness/build.mjs
AX_STREAMLIT_PYTHON=/tmp/ax-code-streamlit-review-venv/bin/python AX_STREAMLIT_EVIDENCE=/tmp/ax-code-streamlit-evidence pnpm --filter @ax-code/electron exec electron "$PWD/.internal/reports/supervision-streamlit-2026-10-18/harness/streamlit-smoke.cjs"
```

The harness uses an isolated profile and loopback-only fixture servers, and terminates its owned process groups in `finally`. It does not operate an installed AX Code Desktop profile. `AX_UIUX_FOCUS_CASE=1` selects the narrow German 200% keyboard screenshot case; use a separate evidence directory to preserve the full matrix.

## Validation and review

All required checks passed. The final full suite passed **5,501 tests with 10 skips**. Validation results and retained command logs are in [validation.json](validation.json) and `validation/`. Shell tests round-trip spaces, Unicode, quotes, semicolons, and command-substitution text through actual sh/bash/zsh without executing extra commands. Behavioral tests cover request locks/provenance/reconciliation, explicit recipe add/save, readiness, wrong ports, late navigation, unsupported shells, and terminal replacement.

[Grok/Codex review dispositions](../../reviews/supervision-streamlit-implementation-2026-10-18/review-disposition.json) distinguish completed advice, independently reproduced fixes, rejected findings, and the two timed-out broad Grok passes. The prior [Grok/AX Code DeepSeek advisory](../../reviews/streamlit-uiux-2026-10-18/review-disposition.json) supplied the initial direction. Reviewer output is advisory, not runtime or release proof.

Grok completed the planning review, but both broader implementation attempts and a final 150-second helper-only audit timed out without final output. The requested Grok implementation opinion therefore remains unavailable. Codex completed planning and both implementation passes; its reproducible findings were fixed and the final candidate passed all required automated checks. The review gate is qualified accordingly, not represented as two-reviewer implementation approval.

Archived reviewer/command text has trailing whitespace and excess trailing blank lines removed for source-control hygiene; wording is preserved. Fixture server logs are cumulative across local spike attempts; `receipt.json` and its recorded origins identify the final successful native run.
