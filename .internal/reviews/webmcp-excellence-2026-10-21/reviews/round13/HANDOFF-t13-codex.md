# WX-10: real pause and take over

Date: 2026-10-21. Worktree: `wt-wx10`, branch `wx10-pause`, baseline `5b7c6fe6`.
Controlling record: `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md`, section 4,
WX-10 and persona A7. WX-15's round-13 handoff and the baseline A7 audit were reviewed.
All changes are local and uncommitted. No push, package, release, or publication was performed.
No judge rescore was requested or obtained; this does not claim the target score has been achieved.

## Implemented behavior

- The enrolled pane has a primary **Pause agent** button and a separate outline **Disconnect agent**
  button. Paused panes offer **Resume agent**, retaining Disconnect. These remain available even
  when an enrolled page reports a load error. Native buttons are keyboard reachable and have visible
  accessible names. After cancellation/resume, focus returns to the primary access control (or address
  recovery control); an intervening focus move into an input is respected.
- Pause retains the pooled view, project storage, loaded page, document identity, read references and
  session/provider enrollment. It does not navigate, close the view, wipe storage, or enroll a replacement
  provider. The visible page remains available to the person. Resume rechecks runtime compatibility and
  releases the gate on that same provider. Existing document/element validity checks still apply.
- The pane says: "You have control of the page. The agent's calls wait until you resume."
  A held call has an explicit waiting line, independently of transcript availability.
- Pause, Disconnect and session revocation synchronously mark active agent requests cancelled, abort
  owned navigation, and request native tool/page-operation cancellation. Late completions cannot replace
  the cancellation with success. Pause/Disconnect return the number of stopped in-flight agent requests;
  the UI waits for that reply before acknowledging it. Zero produces no cancellation message.
- Cancellation feedback explicitly says that page changes already made stay. It never promises rollback.
  Requests receive `Error` replies with `agent-paused` or `agent-disconnected` reasons. Runtime reply
  delivery is bounded; local cancellation does not depend on a healthy runtime.
- Requests arriving during Pause (including a poll settling after the click) enter the existing waiting
  gate instead of being dropped. They keep their original identity and deadline. Resume dispatches them;
  Disconnect fails the held request with `agent-disconnected` before retiring the provider. A deadline
  reached while paused returns `waiting-for-resume-timeout`. This is bounded waiting, not an unlimited queue.
- WX-15's dialog/palette/minimize behavior remains: hide gates new work but does not cancel executing work.
  Explicit pause/disconnect/revoke still cancel navigation and native calls.

## Scope and evidence

Production changes are in `EmbeddedWebMcpBrowser.tsx`, `desktop-webmcp-browser.js`, and `en.ts`.
The Electron request tracker now records the active request and its cancellation callback so cancellation
counts, explicit replies, and late-result suppression share the same lifecycle.
No SDK/runtime pin or canonical coding runtime was changed.

DOM coverage uses `src/test/dom.tsx` and real English strings for the new messages. It covers separate
controls, tab eligibility, focus recovery, keeping a person's input focus, deferred and failed cancellation
acknowledgements, zero/singular/plural counts, takeover/waiting copy, resume, and access controls during errors.
Electron coverage includes preserved enrollment/storage/document identity, requests arriving before and after
Pause, native tool and read/act waiting, changed-document rejection, waiting deadlines, Disconnect failure,
late completion suppression, cancellation counts, and the existing transient-visibility cancellation matrix.

The native project-browser journey now selects the scripted session, enrolls a model-free provider in the
isolated harness stub, tabs to Pause, activates Pause/Resume with real CDP keyboard events, reads native view
identity/generation/visibility back, and checks the manual result and address survive. The stub routes are
scenario-only test infrastructure and have a lifecycle regression test. This is the **idle takeover subset
of W5**, not a native long-call cancellation or real-agent/model qualification.

## Verification

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed |
| `pnpm --dir desktop/packages/electron exec vitest run` | Passed: 94 files, 869 tests passed, 1 skipped |
| `pnpm --dir desktop/packages/ui exec vitest run` | 639 files passed, 2 failed; 4,459 tests passed, 8 failed; see localization constraint below |
| Focused `EmbeddedWebMcpBrowser.test.tsx` | Passed: 29 tests |
| `pnpm run build` | Passed: 3 build tasks |
| Native `project-browser-webmcp.mjs --artifacts /tmp/wx10-native` | Passed on macOS arm64: W1, W2, W5 idle keyboard takeover; CSP and renderer-error checks passed |
| `git diff --check` | Passed |

Logs: `/tmp/wx10-{typecheck,lint,boundaries,electron,ui,build,native}.log` and
`/tmp/wx10-ui-focused-restored.log`. Native snapshots/screenshots are under `/tmp/wx10-native/`, including `w5-paused.json`,
`w5-paused.png`, `w5-resumed.json`, `w5-resumed.png`, and `w5-native-views.json`.
Screenshots capture the main renderer; embedded-view visibility is verified through native status readback.

**Localization constraint:** only `en.ts` was changed, as explicitly requested. The existing strict
`loadDictionary` validation rejects non-English dictionaries when their keys differ from English. This
causes seven failures in `src/lib/i18n/store.test.ts` and one in
`src/components/views/SettingsView.models.test.tsx` (translated Advanced search). Other languages can fall
back to English until the localization follow-up supplies the new keys. No catalogs, translations,
shared-spelling allowlists, or validator rules were changed to hide that gap. The full UI suite is therefore
not green, and this is not release-ready localization evidence.

## Mutation probes

Both deliberate mutations were killed by behavioral tests. Each source file was restored in a `finally`
block and verified byte-for-byte; restored focused tests passed.

| Probe | Mutation | Result |
| --- | --- | --- |
| Held, not dropped | Return immediately when a provider poll settles while paused | Killed: both before/after-pause arrival tests fail |
| Never claims rollback | Replace the singular English acknowledgement with "Stopped 1 agent call. All changes were rolled back." | Killed: both Pause and Disconnect DOM acknowledgement tests fail |

Logs: `/tmp/wx10-mutation-held-not-dropped.log`, `/tmp/wx10-mutation-never-claims-rollback.log`.
Probe receipts: `/tmp/wx10-mutations.json`. Probe commands and restoration code: `/tmp/wx10-mutations.py`.

## English strings for localization handoff

New keys in `desktop/packages/ui/src/lib/i18n/messages/en.ts` only:

| Key | English value |
| --- | --- |
| `webmcp.actions.pauseAgent` | Pause agent |
| `webmcp.actions.resumeAgent` | Resume agent |
| `webmcp.browser.takeOver` | You have control of the page. The agent's calls wait until you resume. |
| `webmcp.browser.waitingForResume` | Agent call waiting for you to resume. |
| `webmcp.browser.waitingForPage` | Agent call waiting for this page to be visible. |
| `webmcp.browser.stoppedCall` | Stopped 1 agent call. Changes it already made on the page stay. |
| `webmcp.browser.stoppedCalls` | Stopped {count} agent calls. Changes they already made on the page stay. |

Changed existing English key: `webmcp.detail.paused` now says
"Agent access is paused. Resume releases waiting calls." The prior wording incorrectly said pending
requests would not be replayed. Existing Disconnect text remains "Disconnect agent".

New native cancellation payload message (English): "Agent access stopped. Changes already made on the page stay."
New machine reasons: `agent-paused`, `agent-disconnected`, `waiting-for-resume-timeout`.

## Limits

Cancellation acknowledges the local agent-request lifecycle. Native cancellation is best effort and an
already executing page script cannot be interrupted atomically; page/server effects may remain. No undo,
rollback, or completed transactional cancellation is claimed. Preserved storage is covered by lifecycle
checks, not a real account sign-in exercise. No packaged-app, Windows/Linux native, screen-reader,
real-model, or signed-release qualification was performed.
