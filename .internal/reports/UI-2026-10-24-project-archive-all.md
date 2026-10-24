# Project-wide Archive all

The project menu now includes a red **Archive all** action between **Pin project** and **Close project**. Existing actions remain available. All 14 UI locales include the new label and project-specific confirmation description.

The action uses the complete project ownership list rather than visible rows, search results or multi-selection. It includes hidden sessions, subagents and discovered worktrees, excludes archived sessions and sessions owned by other registered projects, and remains disabled until the session inventory and project worktree discovery are ready. Confirmation freezes the membership and count, identifies the project by label and path, and respects the existing confirmation preference. Archiving uses the existing soft-removal and Undo flow.

Bulk archive and Undo also retain each session's original directory when its child store has not been hydrated and the optimistic removal has already hidden its global-index entry. A current authoritative session attachment takes precedence over the saved directory hint.

## Verification

- Root tests: **8,131 passed, 10 skipped** (scripts 247/7, Electron 1,164/1, UI 5,195/0, web 1,525/2).
- Typecheck, lint, boundary checks, locale checks and production build passed.
- Regression evidence: the previous menu failed two new menu tests, and the previous directory resolution failed three new directory tests. The final four focused files passed 108 tests.
- Native Electron WebMCP verification passed in both dark and light themes. Fresh rendered state and screenshots confirmed red text and icon, action ordering, confirmation, Cancel without writes, correct project scoping, correct request directories and the disabled empty-project action. The isolated HTTP fixture archived all 32 intended sessions exactly once and left the other project and previously archived session untouched.
- Two unchanged Electron tests exceeded their existing import-time deadlines while tests and build ran concurrently. Both files passed independently (38 tests), and the complete root suite passed when rerun after the build. The original failed logs are retained.

Evidence is retained locally under `.internal/releases/ui-project-archive-all-2026-10-24-evidence/`; the native operator is under `.internal/releases/ui-project-archive-all-2026-10-24-operator/`. The final full test log is `gates-final/test-serial.log`, and the final native receipt is `native-verified/receipt.json`.

No real user conversations were archived during verification. The native fixture validates Desktop rendering and request scoping, not signed-runtime backend durability. This source change has not been packaged, installed or published; the existing v7.29.0 release remains unchanged. The independently modified `AGENTS.md` is excluded from this change.
