# Configuration editor scope labels

Status: bounded repair under the existing Settings quality requirements.

Commands and Agents draft scope triggers display internal enum values (`user`, `project`) rather than their localized menu labels (`Global`, `Project`). The shared SelectValue deliberately defaults to displaying the raw value; do not change its behavior globally.

1. Reproduce the two scopes in both mounted forms and the initial/switching scope in native WebMCP.
2. Supply the existing translated label explicitly in these two forms, preserving stored scope values and menu behavior.
3. Verify focused tests, type checking, lint, build, native scope switching and visual readback; no valid configuration save or real user data mutation.
4. Commit the scoped change and evidence. Other SelectValue consumers require individual review.
