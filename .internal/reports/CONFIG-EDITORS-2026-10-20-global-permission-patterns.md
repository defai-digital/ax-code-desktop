# Preserve wildcard permission patterns

[Plan](../plans/PLAN-2026-10-20-global-permission-patterns.md).

## Confirmed data loss

Desktop parsed wildcard-permission (`*`) pattern maps but hid the Default section in the advanced editor and skipped that group when building the save payload. Thus adding a Default pattern created an invisible dirty rule, and editing an unrelated field on a draft containing such rules dropped them from the emitted JSON.

The runtime's current `config/schema-impl.ts` accepts wildcard PermissionRule objects via its catchall. `permission/index.ts#fromConfig` expands their entries into rules, and `permission/evaluate.ts` selects the last matching rule. This repair consumes that existing contract; no sibling source or SDK change is needed. It does not change the runtime's exact-grant requirements for computer or schedule permissions.

Before repair:

- Three mounted regressions failed (`/tmp/ax-global-pattern-before.log`): hidden loaded pattern, ordinary-pattern payload loss, and prototype-looking pattern-key loss.
- Native adding Default / `src/private/**` / Ask timed out waiting for the pattern to appear (`/tmp/ax-global-pattern-native-before-20261020.log`).

## Repair

- Display Default's specific patterns whenever present. Keep Global Default as the sole fallback control rather than adding another wildcard fallback selector.
- Emit a wildcard map containing the fallback first, followed by specific patterns. Preserve named-tool maps alongside it; use data-safe dictionaries for tool and pattern keys.
- Mounted tests inspect the JSON-serialized payload, including `__proto__` pattern keys, named-tool rules and fallback ordering. The native journey adds, edits and resets a Default pattern without saving a configuration.

## Verification

- Full UI suite: 561 files / 3,760 tests passed (`/tmp/ax-global-pattern-ui.log`). Focused agent tests: 12 passed (`/tmp/ax-global-pattern-focused-final.log`).
- Workspace lint and source-text test ratchet passed. No new source-text assertions.
- An initial build caught a widened string type in the new test fixture; changed the fixture to literal permission actions. Final Desktop build, including type checking, passed (`/tmp/ax-global-pattern-build-final.log`). The final native run was gated on that successful build.
- Native journey passed (`/tmp/ax-global-pattern-native-verified-20261020.log`): added Default / src/private/** / Ask, changed it to Deny, reset it, and verified clean state, alongside the prior rule and narrow-layout checks. CSP and renderer exception checks passed.
- Visually inspected `pages/wildcard-permission-pattern.png`: the src/private/** pattern, New badge, reset control and Deny selector are visible. Native names identify the Default rule explicitly.

This is UI projection/payload verification, not an execution test of runtime permission enforcement. No actual policy was saved, and no sibling source, SDK pin or runtime pin was changed.
