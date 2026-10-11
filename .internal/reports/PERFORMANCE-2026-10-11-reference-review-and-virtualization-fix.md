# Reference review and virtualization fix

Reviewed local reference snapshots on 2026-10-11. References were read only;
no upstream source, dependencies, build output, or runtime was imported. This
work keeps Electron and the current AX Code SDK/runtime ownership boundaries.

## Findings from reference projects

| Project and snapshot | Reviewed source | Useful approach and AX Coder decision |
| --- | --- | --- |
| OpenCode `d21b0790a6c146815f28fea604e41e922f009590` | `packages/app/src/session/timeline/virtualizer.tsx`; `packages/session-ui/src/components/markdown-worker.ts`, `markdown-worker-queue.ts`, `markdown-cache.tsx`; `packages/ui/src/context/marked-base.tsx` | Reactive visible ranges, worker parsing, superseded-request coalescing, cancellation, bounded result caches, and a restricted small-text synchronous path. Adopt correct range invalidation now. Worker parsing is the next substantial improvement for the measured large live paragraph. |
| OpenChamber `23273f0e3de94391a5abeee15355f2cb897d3de7` | `packages/ui/src/components/chat/MessageList.tsx`; `components/chat/markdown/markdown-worker.ts`; `contexts/DiffWorkerProvider.tsx` | Current upstream uses one virtualized timeline, stable row identities, worker highlighting with request coalescing and a byte-limited cache, and deferred worker warmup. These changes are larger than our extracted renderer. Apply the demonstrated stale-range fix locally rather than importing the upstream timeline architecture. |
| OpenHands `2d174175cedeac45a0bd7c776728464d7c1140a7` | `src/components/features/markdown/markdown-renderer.tsx`; `src/utils/streaming-delta-batcher.ts`; `tests/e2e/conversation-markdown-render-performance.spec.ts` | Memoize unchanged bodies; batch deltas with explicit ordering/flush behavior; measure composer latency, DOM counts, long tasks, and content preservation. AX Coder already batches deltas and reuses stable Markdown blocks. Retain native-input performance evidence alongside behavioral tests. |
| Goose `3bd852002903e016ff30947e973f76e2fcfcf90f` | `ui/desktop/src/components/ProgressiveMessageList.tsx`, `MarkdownContent.tsx` | Memoized message rows and code blocks help avoid repeated work. Progressive mounting can spread startup cost but does not establish a bounded DOM for a fully loaded history. Avoid replacing functioning virtualization with progressive rendering. |
| Continue `5522c6f44ca0ac3528b37244818fbfa39b5af470` | `gui/src/components/StyledMarkdownPreview/index.tsx` | Memoized Markdown previews preserve unchanged content. AX Coder already has stable block reuse; another memo wrapper alone would not solve expensive reparsing of a changing paragraph. |
| Cline `c3a40572765b76873c597247941118c1778d02c8` | `apps/vscode/webview-ui/src/components/chat/chat-view/components/layout/MessagesArea.tsx`; `components/common/MarkdownBlock.tsx` | Virtuoso plus memoized Markdown. Its `Number.MAX_SAFE_INTEGER` bottom viewport expansion keeps future content mounted for following behavior. Do not adopt that overscan: it weakens the DOM bound when reading earlier history. Preserve our finite overscan and separate tail. |

These are observations about the checked-out source, not claims about the latest
upstream releases or comparative runtime speed. Aider is terminal-only and was
not used to derive renderer changes. Reference README product/version claims
were not treated as independent evidence.

## Applied change

`MessageList-impl.tsx` previously memoized `getVirtualItems()` using only the
virtualizer object and enabled flag. TanStack retains the same object while its
range changes. An initially empty result could therefore remain cached, causing
`StaticHistoryList` to keep mounting every history entry through its fallback.
A nonempty cached result could also keep displaying the old scroll range.

Read the range every render and opt this component out of React compiler
memoization with `"use no memo"`. Existing explicit memoization for projections,
callbacks, and static children remains in place. The compiler opt-out prevents
the production compiler from reintroducing the same stale mutable-instance read.
Finite overscan, short-conversation rendering, and the separate tail remain.

The new test mounts the actual MessageList with actual turn projection and a
stable mock virtualizer that issues hook state updates as its range changes.
It checks initial empty-to-measured range, scrolling between nonempty ranges,
tail visibility, and the short-history path. Both range tests failed against
the original source and all three pass with the fix.

## Production renderer replay

The earlier [renderer validation](PERFORMANCE-2026-10-11-renderer-validation.md)
and candidate artifacts describe the historical experiment before this fix was
applied. They are retained as historical evidence. The new `applied-results.json`
is a fresh replay built directly from the patched production source through the
normal Vite configuration, React compiler, and minification. No experimental
load-hook replacement was used for this replay.

| 4,000-message Markdown streaming fixture | Historical original source | Applied production source |
| --- | ---: | ---: |
| Observed keydown duration p95 | 112 ms | 32 ms |
| RAF interval p95 | 83.3 ms | 9.2 ms |
| Tasks over 50 ms | 43 | 0 |
| RAF intervals over 50 ms | 106 | 0 |
| DOM elements at capture | 129,151 | 4,968 |

The applied replay received and inserted all 79 native characters, captured no
runtime errors, and completed 246 stream publications over approximately 12.3
seconds. Seven history entries were mounted at capture. The user-history
subscription probe did not rerender; that probe does not count every ChatInput
render. The final screenshot was visually inspected for visible history, live
Markdown, and the entered text.

This is one renderer fixture replay on a shared machine, not a complete desktop,
startup, or cross-platform acceptance test. Event Timing observes events at least
16 ms long and reports rounded durations. Background builds may compete for CPU.
Historical comparisons are not repeated-run statistical estimates. See the
archived harness README for workload and measurement limitations.

## Next improvements in order

1. Move large live Markdown parsing and highlighting into a lazy worker. Coalesce
   pending updates per block, reject stale results, bound cache bytes and queue
   depth, and dispose session state. Keep escaped text as a failure fallback.
   Preserve current file links, images, math, Mermaid, copy/export, and streaming
   completion semantics. This must replace the expensive live ReactMarkdown
   parse, not merely run block splitting in a worker and parse again on the UI.
2. Bound expanded tool-output DOM with row virtualization or an explicit preview
   and full-output viewer. Keep complete copy/export and line numbering. The
   previous candidate still mounted about 25,000 DOM elements with expanded
   output, so timeline virtualization alone cannot solve this case.
3. Measure cold opening, upward scrolling, prepend anchoring, and navigation to
   an unmounted message. The current initial empty-range fallback can still mount
   the full history temporarily; warm-streaming evidence does not qualify it.

Neither worker parsing nor tool-output virtualization is claimed as implemented
by this change. The previous stress test's very long single paragraph remains
slow after the range fix. There is no evidence here for removing additional
product code as unused, or for migrating the desktop shell to Rust.

## Verification

- Behavioral regression: two failures on original source; three passes after fix.
- Full workspace tests: 2,824 passed and one skipped.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run check:boundaries`, and
  `pnpm run build`: passed. The build completed all three tasks, including the
  Electron arm64 native rebuild. Existing bundle-size warnings remain.
- Production Electron fixture: evidence above, Electron 42.5.2 / Chromium
  148.0.7778.271; no real model or AX Code runtime calls.
- Unrelated Electron runtime-recovery edits and reference clones are excluded
  from this commit. Full workspace checks include the existing local edits.
