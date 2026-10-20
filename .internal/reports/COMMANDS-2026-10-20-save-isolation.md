# Command editor asynchronous save isolation

## Reproduced defects

The Commands form scoped incoming values by project, but scoped save completion only by command name. A pending save in project Alpha could overwrite the dirty baseline of Beta's same-name command. Switching away and back to Alpha also allowed completion from an earlier form visit to modify the new form. Successful create completion unconditionally cleared the draft and selected its command, even after navigation.

A second defect left Save enabled after a successful save with unchanged fields. The dirty comparison was memoized by field values, while the saved baseline lived in a mutable ref and changed independently.

Before repair, mounted component regressions failed both project-switch cases (`/tmp/ax-command-save-before.log`: 2 failed, 1 passed). After the isolation repair, the additional immediate-clean-state regression still failed (`/tmp/ax-command-save-clean-before.log`: 1 failed, 4 passed).

## Changes

- Each committed project/selection/draft editing context has a generation, invalidated on navigation and unmount. Save completion may update fields, baseline, or created-command selection only in its submitting context.
- The inexpensive dirty comparison runs every render, including completion renders with unchanged field values.
- Keep functional field updates so edits typed during a same-form save survive.
- Replace the obsolete command name-only source assertion with mounted behavioral coverage. No new source-text assertions were added.

Plan: [Command save isolation](../plans/PLAN-2026-10-20-command-save-isolation.md).

## Verification

- Full UI suite: 560 files, 3,746 tests passed (`/tmp/ax-command-save-final-tests.log`). The command used the package test wrapper with `--`; it ran the full suite, not just the supplied files.
- Five new mounted regressions cover cross-project completion, away-and-back navigation, in-flight edits, stale creation selection, and immediate clean state.
- UI type checking passed; final Desktop build passed (`/tmp/ax-command-save-build-final.log`).
- Workspace lint passed (`/tmp/ax-command-save-lint.log`). Source-text test ratchet passed with no new entries (`/tmp/ax-command-save-ratchet.log`).

## Scope

The delayed save regressions use controlled store promises and real mounted React form interactions. They are not a native cross-project timing reproduction. Native Settings audit results are recorded separately below. No runtime API, SDK, persisted configuration format, credentials, or user projects changed. Similar asynchronous patterns in other editors remain candidates for separate reproduction; this report does not claim them fixed.

## Native WebMCP and visual readback

`pnpm run e2e:desktop:settings-webmcp -- --artifacts /tmp/ax-command-save-settings-20261020` passed against the final build. All 15 Settings tabs were visited with 616 rendered control observations (not unique controls). Native option selection, numeric input/reset, preference toggle/restore, shortcut paging/search/focus, light/dark/narrow layout, malformed Hooks response recovery, preload, CSP, and renderer exception checks passed.

Visually inspected `pages/commands.png` and `pages/shortcuts-narrow-light.png`: readable navigation and empty-state instructions, visible focus, no horizontal overflow or obstructed controls in these captures. The Commands capture is an empty-state view, not evidence of the asynchronous save repair. External login, downloads, OS dialogs, destructive actions, and every nested editor action remain outside this audit.
