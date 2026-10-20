# Preserve wildcard permission patterns

Status: data-loss repair under the existing configuration quality requirements.

The runtime Permission schema accepts an object for the wildcard permission key `*` (catchall PermissionRule). Desktop parses such pattern rules but hides the `*` section and skips it while serializing. An unrelated prompt edit therefore drops existing wildcard-specific patterns.

1. Reproduce loaded-rule visibility and emitted payload loss with mounted tests, plus native add-rule visibility.
2. Render wildcard-specific patterns under Default while keeping Global Default as the single control for the fallback action.
3. Serialize the wildcard map with the fallback first and specific patterns afterward. Preserve named-tool rules and pattern keys such as `__proto__` using data-safe dictionaries. Do not change runtime evaluation, ownership, policies or SDK pins.
4. Verify mounted payload/visibility regressions and native edit/reset behavior; run full UI suite, type checking, lint and build. Record evidence and commit scoped files.
