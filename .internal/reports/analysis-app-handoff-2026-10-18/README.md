# Analysis output and Desktop app handoff

Implemented locally on 2026-10-18. Canonical runtime commit: `ff84ba9f1` in `../ax-code`. Desktop implementation is the commit containing this report. Additive to project-run v3; paired Desktop ADR-016 / runtime ADR-256 and the v1 handoff spec preserve canonical runtime ownership.

## User flow

1. Ask for analysis, a chart, or a reusable graphical tool. The runtime's existing Craft instructions direct eligible matching tasks to the builtin `analysis-output` skill. One-off results prefer standalone artifacts; reusable inputs and filters can produce Streamlit.
2. A completed assistant answer includes a project-file declaration. Desktop displays its real entrypoint and Run. The user does not select a pipeline, interpreter, port, or container.
3. Run uses the existing project runner. Missing dependencies open Prepare and run immediately; setup remains an explicit separate action. Ready apps reopen their preview; preparation is visible; Stop remains in project actions. Closing the preview keeps the process running.
4. `/analysis-output` is the explicit fallback when a model does not select the skill. Desktop now preserves the runtime's invocable skill command catalog for autocomplete and dispatch, while keeping those entries out of editable command settings. Users do not install the skill into each project in the built runtime.

## Contracts and regression coverage

The `ax-code-app` fence contains only `version`, `kind` and a relative Python `entrypoint`. Strict parsing rejects extra execution settings, unsupported versions, traversal, absolute/drive paths, controls and oversized input. The runner additionally checks file existence and realpath containment.

Only finalized nonstreaming assistant text can produce an action; tool, reasoning and user Markdown remain inert. The originating session/worktree supplies the directory. A cancelable in-process request is synchronously claimed once; mismatched sessions/projects, later session changes during configuration/terminal creation, and repeated clicks do not dispatch duplicate commands. Existing saved interpreter/port settings survive. Missing listeners report a failure. Mobile views explain the unavailable control. Memoization includes the part's source identity and completion.

No new runtime, SDK route, background agent, process supervisor, keyword classifier, hidden user configuration, automatic installation permission or Docker dependency was added. The skill and prompt are shipped through the existing runtime builtin bundle.

## Evidence

- Desktop checks: typecheck, lint, build, boundaries/release contract and all 14 locales passed. Full repository tests plus the final UI rerun yield **5,544 passed, 10 skipped**; the final UI run is **3,284 passed**. Logs and exact count breakdown are in `validation/` and `validation.json`.
- Runtime: **50** skill/system tests passed, typecheck and skill standards passed, structure passed, and script tests **422 passed / 96 skipped**.
- GLM implicitly loaded the skill and completed a standalone SVG with verified totals 250/300/300, without a server declaration. Independent XML parsing passed.
- MiniMax, using explicit `/analysis-output`, completed a Streamlit app and exact handoff. Streamlit AppTest verified all-region total 850, East total 360, three filtered rows, empty-selection behavior and the download control. The real Desktop Python runner served the app, printed its actual URL and freed the listener on Stop.
- Qwen with the exact new Craft sentence implicitly loaded the skill and completed a CSV-upload/region-filter/chart/download app and handoff. Independent AppTest confirmed East 360 and West 490 and the presence of upload/download controls. Upload transfer itself was not exercised by AppTest.
- Live model runs used the already installed runtime with an isolated project-scope copy of the canonical skill; the guided case appended the exact new Craft sentence. Builtin discovery, slash exposure and system prompt assembly are tested independently from source. These are bounded integration samples, not a provider-wide success-rate study or a signed installed-app end-to-end qualification.

`verify-generated.py` reruns actual Streamlit app checks and the Python runner against the preserved synthetic fixtures when invoked with a Python environment containing Streamlit and pandas. The first verification attempt failed only because its URL assertion did not normalize a trailing slash; the failed log and corrected result are retained. The generated MiniMax app emits a deprecated `use_container_width` warning on Streamlit 1.66.0; behavior passed and its output is preserved verbatim.

## Failed and limited evidence

The first unguided Qwen run timed out; it is not a successful routing result. A separate DeepSeek run returned a CLI tool, missed its requested line limit and reported inconsistent file readback; it is not a successful GUI case, and its readback hypothesis was not independently confirmed. Those runs motivated the eligibility-aware Craft instruction and the explicit slash fallback. Some workspace-write shell probes were rejected by the test runtime's isolation policy; follow-up samples used read/write tools without broadening permissions.

DeepSeek returned a substantive implementation review. Proven findings were fixed; existing duplicate-start locks, worktree routing and first-event setup recovery were verified rather than rewritten. Grok's bounded follow-up timed out without output and is not approval. See `review-disposition.json`; the earlier five-model design consultation remains in the project-run v3 report.

## Distribution boundary

This feature commit does not update installed apps, publish a release, or change the pinned runtime/SDK. The runtime skill and Craft sentence are in local commit `ff84ba9f1`, **after** the published v7.27.4 runtime commit `94a314552`; v7.27.4 does not contain them. The subsequent user-authorized dependency update to runtime 7.27.4 / SDK 2.6.35 is recorded separately. Do not claim that pin update distributes the new builtin skill. A future qualified runtime release containing `ff84ba9f1`, plus its Desktop consumer, is needed for packaged availability.

The existing POSIX shell / compatible Python requirement and unqualified Windows/remote/signed-upgrade limits remain. The user's unrelated `.internal/reference/README.md` was preserved byte-for-byte.
