# Agent permission editor usability

[Plan](../plans/PLAN-2026-10-20-agent-permission-editor.md).

## Reproduced

- Adding a Bash `git status*` Ask rule produced an unnamed icon-only reset button. Native Settings capture failed with one unnamed button (`/tmp/ax-agent-permissions-before-20261020.log`). The control inventory also showed repeated Global/Ask selectors without tool or pattern context.
- At 800px, the custom rule row squeezed the pattern field into a small pill and clipped the Deny action. The native width/bounds check failed (`/tmp/ax-agent-permissions-pattern-before-20261020.log`), and its failure screenshot was inspected.

## Repair

- Accessible names now identify the global default, each tool wildcard, each tool/pattern selector and both reset-button paths using existing translations and rule context. Selected action text remains included.
- Custom-rule controls stack based on the editor container width rather than the window breakpoint. Permission semantics, baseline restoration, runtime behavior and stored configuration are unchanged.
- A dedicated native journey exercises a temporary agent draft only. It adds a rule, changes its action, resets it, changes/resets a wildcard, changes/restores the global default, checks clean state, hides/reopens the editor and checks narrow pattern/action bounds. It never submits a valid configuration save.

Run after build:

```sh
node desktop/packages/electron/scripts/e2e/agent-permissions-webmcp.mjs --artifacts /tmp/agent-permissions
```

## Native client defect found by the expanded journey

The first post-build run failed while reading controls. Diagnostic readback showed a Completed native response containing a JSON string snapshot, not an object (`/tmp/ax-agent-permissions-recheck-20261020.log`). The driver previously returned that string unchanged. It now parses text once, preserves structured objects, and rejects malformed text and non-object values with bounded diagnostics. It never retries an action automatically.

Before the driver repair, two client regressions failed (`/tmp/ax-webmcp-text-before.log`). All nine client tests passed after repair (`/tmp/ax-webmcp-text-after.log`), including non-object JSON cases.

## Verification

- Focused UI regressions: 15 passed; UI type checking and Desktop build passed (`/tmp/ax-agent-permissions-tests-final.log`, `/tmp/ax-agent-permissions-typecheck.log`, `/tmp/ax-agent-permissions-build.log`).
- Full Electron suite: 91 files, 752 tests passed, 1 skipped (`/tmp/ax-agent-permissions-electron.log`). Workspace and final harness lint passed.
- Native rule edit/restoration and narrow-bounds journey passed (`/tmp/ax-agent-permissions-actions-20261020.log`). A further final pass also exercised missing-permission validation and preserved clean state (`/tmp/ax-agent-permissions-final-pass-20261020.log`). CSP and renderer exception checks passed.
- Visually inspected final `pages/agent-permission-actions-narrow.png`: the permission picker, full-width pattern field, and all three Allow/Ask/Deny buttons are visible inside the narrow editor.
- An intermediate bounds assertion counted the global-default selector along with custom-rule actions. The final assertion scopes buttons to the custom-rule row.
- One intermediate native click returned Error with empty output before Settings opened; it did not recur in the two subsequent passes. Added the target control name to click failure diagnostics without replaying mutations. Its underlying transient cause is not claimed fixed.

Existing project configuration, credentials and runtime-pin changes are outside the commit. These fixtures do not qualify runtime permission enforcement or saving real policies.
