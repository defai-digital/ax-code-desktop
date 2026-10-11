# Large file and patch dialog rendering

## Problem and implementation

Tool-output dialogs mounted Pierre `File` and `PatchDiff` without Pierre's `Virtualizer` context or the existing shared worker pool. A 4,000-line TypeScript fixture created approximately 72,000 Shadow DOM elements and blocked the renderer for more than a second. Looking only at `document.querySelectorAll` would miss this cost because the code lives in a shadow root.

`ToolCodeViewport` now wraps large read-file results, write-file input previews, and patches. It uses the existing output thresholds (more than 200 lines or at least 32,768 characters), a 60vh scrolling viewport, and 400 pixels of overscan. Small content retains its original rendering path. Pierre's existing React hooks select their virtualized file/diff implementations when this context is present.

Large views consume the existing `DiffWorkerProvider` pool through Pierre's `WorkerPoolContext`. The component waits for a pool instance before mounting Pierre because file instances capture their pool at mount time. While the pool is unavailable, the existing virtualized plain-text output keeps the entire source accessible. Diff-mode changes remount with the matching unified or split pool. Shared pool sizes and cache budgets are unchanged. Loading code hosts retain a one-pixel minimum height so Pierre anchors their top when asynchronous syntax arrives; a zero-height host otherwise jumped to the file end. The final validation requires an initial scroll position of zero.

The packaged-protocol test exposed an existing incompatibility: worker pools requested `shiki-wasm`, but the production CSP does not allow WebAssembly compilation. The pools now request the supported `shiki-js` engine, which is also the installed library's default. The CSP and permissions remain unchanged. This corrects the shared pool used by other diff views as well as the dialog.

Copy and download use the full source passed to each view. For read results, that is the existing parsed file content, with tool wrappers and numbered prefixes removed and line endings normalized by the existing parser. Patch and write-preview actions use the original patch/content string. Browser selection and find remain limited to mounted rows; the complete-source actions provide access to offscreen content.

## Production-compiled Electron measurement

The archived fixture mounts the actual tool-output dialog with production CSS, theme and i18n providers. Both builds use the production Vite configuration, React Compiler, minification, Electron 42.5.2 / Chromium 148.0.7778.271, and the production `app://` protocol handler and CSP. The baseline substitutes only `ToolOutputDialog.tsx` from `a16e771`; the candidate uses the new source. Runs are sequential without a competing build, using a fresh BrowserWindow for each scenario.

Each scenario starts with a small warmup file/patch, then publishes the full content 500 ms into a 12-second typing measurement followed by a 300 ms drain. The modal contains a fixture-only textarea receiving native Electron keyboard events every 150 ms. This tests renderer responsiveness inside the real dialog; it is not a ChatInput or entire-application benchmark. Key-to-frame timing starts when the keydown handler runs and ends on the second animation frame, excluding time queued before that handler.

| Metric | File baseline | File candidate | Patch baseline | Patch candidate |
| --- | ---: | ---: | ---: | ---: |
| Source bytes | 301,750 | 301,750 | 305,859 | 305,859 |
| Shadow DOM elements | 72,040 | 1,648 | 72,041 | 849 |
| Long tasks over 50 ms | 3 | 0 | 3 | 0 |
| Total long-task time | 1,270 ms | 0 ms | 1,277 ms | 0 ms |
| Maximum long task | 1,055 ms | 0 ms | 1,050 ms | 0 ms |
| Maximum frame interval | 1,250.3 ms | 24.6 ms | 1,259.3 ms | 25.3 ms |
| Handled key-to-frame p95 | 68.8 ms | 16.3 ms | 76.3 ms | 15.8 ms |
| Received keys / added characters | 79 / 79 | 79 / 79 | 79 / 79 | 79 / 79 |
| Worker instances / messages | 0 / 0 | 1 / 2 | 0 / 0 | 1 / 2 |
| Renderer / worker errors | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Shadow DOM counts decrease approximately 98% for files and 99% for patches. Candidate highlighter workers were cold when the large content appeared. Both completed syntax rendering, started at scroll position zero, and reached the unique final row. After the timed measurement, the driver checks the opening and middle source positions, then the final row. The patch retains its final row after switching from unified to side-by-side mode; the matching shared pools produce three worker instances with five replies and no worker errors. Screenshots were visually checked. These are paired single-run observations, not a guarantee for every file, language, or machine.

The earlier virtualization-only measurement is retained to show why the worker connection matters: limiting DOM alone still left a roughly 0.9-second renderer task.

## Validation and limits

- Seven focused regressions cover small-view pass-through, bounded large-view configuration, complete copy/download, changed source, unavailable-pool access, and matching diff pools.
- Full workspace suite: 2,861 passed, one skipped.
- Workspace typecheck, lint, ownership/boundary checks, and production desktop build passed.
- Packaged-protocol renderer tests verify actual worker messages, rendered syntax, unchanged source sizes, complete native input, final content, mode switching, and zero errors.

Worker initialization and total highlighting time are not eliminated; they run outside the renderer. Patch parsing, initial read-output parsing, and main-thread layout still incur costs. This change does not virtualize every inline diff or file view. The JavaScript engine can differ from the WASM engine on complex grammars; common TypeScript output was checked here, not every supported language. Runtime ownership, SDK/runtime pins, and shadow-only release policy remain unchanged.

## Evidence and reproduction

[code-viewport-2026-10-11](./code-viewport-2026-10-11/) contains raw paired metrics, validation results, screenshots, and the self-contained harness. Copy its `harness/renderer.html` and `harness/renderer.tsx` into temporary `desktop/packages/web/perf/` files. From the web package, run its `harness/build.mjs` with `AX_PERF_BASELINE=1` for the baseline, then without that variable for the candidate. Remove the temporary files and directory before the ordinary desktop build.

Use the pinned Electron executable to run `harness/run.cjs`, setting `AX_PERF_DIST` to `/tmp/ax-coder-code-viewport-baseline-dist` or `/tmp/ax-coder-code-viewport-candidate-dist` and a distinct `AX_PERF_EVIDENCE` directory. Set `AX_PERF_EXPECT_TOP=1` for the candidate to require its initial position to remain at the first line. The harness currently contains this checkout's absolute path; adapt it for another checkout. It blocks live API fetches and uses synthetic source without projects or credentials.
