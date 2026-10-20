# Mission Control, Workspace and Review Changes UX verification

Date: 2026-10-20. Initial baseline: `1ec92046`. Integration base at final verification: `ec7f89ad`.
The intervening worktree-runtime implementation and governance commits were concurrent work and were preserved.

## Delivered behavior

- Mission Control separates its heading and primary actions from scope/density controls. Search matches titles, project
  labels, paths and goal objectives without changing urgency order. Status facets use scope plus query for their counts;
  selection is single-choice, with attention and review separated. A result count, reset action and hidden-needs-you
  recovery make filtered states explicit. Existing Live, Recent and working sets remain the scope layer.
- Every row has a visible Details disclosure. Project context precedes the session title in action names, so duplicate
  labels remain distinguishable in bounded WebMCP observations. Wider row layouts give paths a full line. Details that
  become filtered out close; Escape returns focus to the board. Editable keys, input method composition and shifted `/`
  remain compatible with board navigation.
- Workspace can open repository review from a new-session draft with an effective directory. The current directory is
  displayed in Workspace or in Review, without duplicating it. Existing Files unsaved-change guards remain in use.
- Review uses measured pane width for its automatic diff layout and file-list behavior. At workspace widths up to 56rem,
  the mounted chat and divider are hidden and Review gets the full workspace. Returning to Workspace restores chat;
  resize preserves the chat DOM and unsent text. Focus moves out of a hidden chat/divider. Explicit layout preferences
  and the saved split ratio are preserved.
- All new UI strings are present in 14 supported locales. No runtime/backend, credential, release or dependency contract
  changed in this patch.

## Independent discussion and review

Grok CLI and Claude Code CLI each completed a design discussion and a patch review with tools disabled. Their actual
responses are stored alongside this report. The plan records the selected filter/count model and rejected alternatives.
The patch reviews led to stale-peek, shifted-key/IME, hidden-focus and duplicated-directory fixes. Claims about missing
editable guards, a missing workspace container and conditional DiffView root mounting were disproved against full source.
Regression tests and native verification support the conclusions; reviewer prose is not test evidence.

Muse was attempted with shell and writes disabled, but returned subscription quota exhaustion (429). AX Code DeepSeek
was attempted as a fallback and timed out after 180 seconds without a final review. Neither is counted as approval.

## Verification

| Gate | Result |
| --- | --- |
| Focused supervision/layout/hook tests | 30 files, 214 tests passed |
| Full UI suite | 572 files, 3,866 tests passed |
| `pnpm run typecheck` | Passed across UI, web and Electron |
| `pnpm run lint` | Passed; final WebMCP script also linted after its last edit |
| `pnpm run build` | Passed, 3 tasks; existing large-bundle advisory remains |
| `pnpm run check:boundaries` | Passed, including source-test ratchet and release/runtime contracts |
| `pnpm run check:locales` | Passed: 14 locales, 4,952 keys, 64,376 translated entries |
| Native WebMCP supervision/workspace journey | Passed: 41 recorded click/fill actions; journey about 31 seconds |
| Native CSP / renderer errors | Passed: no CSP violations or uncaught renderer exceptions |
| `git diff --check` | Passed |

The native journey initializes two disposable Git repositories with different tracked-file changes, selects their
observed controls, and checks the rendered shadow-DOM diffs and directory context. It covers draft review, same-name
project actions, path search, zero matches, status filtering, hidden-attention recovery, disclosures and returning to chat.
It selects Dynamic layout through Settings, verifies actual `single`/`split` diff output against measured pane width,
and checks that resizing preserves the same chat node. Unsent composer text survives the Review round-trip.

Screenshots and DOM/control bounds cover Mission Control at 1280, 1024, 800 and 600 CSS pixels, and Review at 2800, 1600,
1280, 1024, 800 and 600 CSS pixels, in both light and dark themes. Representative narrow light/dark screenshots were
visually inspected. The native run uses an isolated profile and a stub runtime; it does not qualify live model execution,
packaged delivery, screen-reader behavior, every locale's rendered layout or destructive hunk actions. Narrow viewport
emulation is a stress test, not a new native minimum-window-size promise. Focus/IME contracts have mounted behavior tests.

Reproduce after build:

```sh
node desktop/packages/electron/scripts/e2e/supervision-workspace-webmcp.mjs --artifacts /tmp/ax-supervision-workspace
```

Raw local logs, intermediate failed harness attempts and screenshots remain in the ignored `native-final/` and sibling
artifact directories. Earlier attempts exposed harness setup issues (temporary-root field, initial project selection,
serializing a DOM reference, responsive-sidebar timing and the Settings page for diff layout); these were repaired before
accepting the final passing receipt. Only the final receipt is counted above.

Implementation and validation are local. This task authorizes a commit, not a push, package installation or public release.
