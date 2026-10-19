# Mermaid rendering capability contract v2

Status: Implementation candidate authorized by the user request to find and fix bugs before Desktop 7.27.3 publication.

This version extends the v1 security and lifecycle contract. Advertised diagram types, renderer pins, export formats and ownership remain as listed in the machine-readable capability contract. It does not rewrite the accepted v1 record.

- Display sanitized SVG as an SVG image document. Styles, identifiers and fragment references are isolated from the application document and other diagrams. Source remains available as image alternative text and through the existing source controls.
- CSS import/font-rule removal inserts whitespace so deletion cannot concatenate a new active rule. The same sanitizer applies to display and exports.
- Official DOM rendering uses the existing eight-second timeout to release the queue and report failure. A pending official renderer is quarantined until its underlying promise settles; another official job fails as unavailable during that interval, while worker rendering continues. Cancellation removes its temporary DOM container. Synchronous JavaScript cannot be preempted by this timer; source and edge limits remain in force.
- Preserve the full rendering/export matrix in both themes, the large-graph fixture, and existing source, streaming and fullscreen behavior. Add browser-level stylesheet and cross-document fragment isolation probes, plus timeout/recovery regressions.

Qualification requires focused regressions, the complete UI suite, typecheck, lint, the production build, and the Electron Mermaid smoke. Results are recorded with the 7.27.3 candidate and publication evidence. Rollback restores the prior renderer as a unit and introduces no persisted-data migration.
