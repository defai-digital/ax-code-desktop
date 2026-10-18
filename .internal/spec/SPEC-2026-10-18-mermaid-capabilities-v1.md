# Mermaid rendering capability contract v1

Status: Implementation candidate authorized by the user's request to plan, implement, test, and commit Mermaid improvements.

## Ownership and source of truth

Desktop owns rendering and export, not the runtime's analysis-output skill or its static-versus-interactive decision.
`desktop/packages/ui/src/components/chat/mermaidCapabilities.json` is the machine-readable source of truth used by
the renderer. The fixture corpus must cover every advertised type. Renderer dependencies are exact versions.
This document adds a contract; it does not rewrite an accepted architecture decision or alter runtime ownership.

## Behavior

- Finalized Mermaid fences render through the existing beautiful-mermaid engine for its six SVG/ASCII types.
  Layout runs in a dedicated worker, with one active job, cancellation, an eight-second deadline, and a bounded cache.
- Seven additional types use the official Mermaid engine in SVG mode only. Its module and diagram chunks load on
  demand. DOM-dependent rendering is serialized so theme/configuration changes cannot affect another in-flight job.
- The official renderer runs on the UI thread. The worker deadline does not apply to that DOM work; source and
  edge limits bound inputs, but do not constitute a hard CPU deadline. No claim of fully off-thread Mermaid support.
- Source is limited to 20,000 characters and 500 lines. The official renderer also limits edges to 300.
- At most 32 pending jobs and 32 cached results are retained. Cache storage is bounded to two million characters
  including keys. Cancelled queued jobs are removed; cancelled worker jobs terminate their worker.
- Streaming, loading, unsupported type, unsupported ASCII, forbidden configuration, input limit, render error,
  worker timeout, unavailable renderer, and queue saturation are separate visible states. Source remains available.
- Source/theme/mode changes invalidate the displayed result immediately. Stale completions cannot replace it.
- Source/diagram switching, source/ASCII copy, SVG/PNG download, and supported-browser PNG clipboard copy are local
  operations. PNG dimensions are capped at 8,192 pixels per axis and 16 million pixels total.

## Security

Source directives and YAML frontmatter cannot override host configuration. The official renderer uses strict security,
disabled HTML labels, no event binding, and no automatic page scanning. Both engines' SVG output is sanitized before
display or caching. Scripts, event handlers, embedded HTML, external images, and non-fragment resource links are removed.
Export performs the same SVG cleaning. No CDN, Mermaid Chart account, external rendering service, or automatic AI repair
is introduced. Errors are rendered as text, with diagnostic text capped at 500 characters.

## Qualification and rollback

Run focused Vitest lifecycle, capability, sanitization, export, and Markdown integration regressions; UI typecheck;
lint; localization checks; boundary checks; and a production renderer build. The browser fixture at
`desktop/packages/ui/dev/mermaid/` exercises every advertised type in both themes, PNG encoding, existing ASCII types,
streaming, source switching, and a 181-node flowchart. It is a local test entrypoint, not a shipped app route.

Record actual results and limitations in the accompanying implementation report. A capability is not an assertion that
every upstream syntax extension works. Revert this change as a unit to restore the previous rendering behavior;
there are no persisted-data migrations, runtime pin changes, or updater changes.
