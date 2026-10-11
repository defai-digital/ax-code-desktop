# Desktop localization implementation and verification

Date: 2026-10-11
Scope: AX Coder desktop source in this repository; no sibling source changes or public release.
Plan: `.internal/spec/SPEC-2026-10-11-desktop-localization-v1.md`.

## Design and review

Read-only local reference review covered OpenChamber's typed lazy dictionaries, Goose's separation of message
and formatting locales, OpenCode's native-menu resources, and OpenHands' completeness checks. No reference
source, catalog, or license-bearing translation was copied. AX Code's canonical fourteen IDs were verified
from its language registry: `en`, `zh-TW`, `zh-CN`, `ja`, `ko`, `fr`, `de`, `id`, `it`, `pt-BR`, `ru`, `es`, `tr`, `vi`.

Muse CLI and Grok CLI reviewed the design before implementation. Their common recommendations were typed keys,
main-owned persistence, explicit plural formatting, atomic lazy switching, an independent conversation preference,
offline native resources, and a distinction between catalog coverage and linguistic quality. Original translation
work used isolated authoring worktrees. Grok's headless write-tool cancellations were handled by requesting
read-only JSON output and validating it locally before saving. Partial catalogs were never accepted as complete.

Both CLIs also received a read-only implementation review. Findings were checked against actual source:

- Native interpolation now shares the renderer's trimmed-parameter and null/undefined behavior.
- A malformed formatting tag retains main's valid message locale.
- Startup failures/timeouts and late imports cannot replace a newer committed selection.
- Main's JSON reader already catches unreadable/corrupt files. Unknown preference schemas fall back safely.
- Locale conversation names and all six explicit plural-category keys are covered by regressions. A suggested
  missing-plural blocker did not reproduce: English already defines all six categories and every catalog is
  required to contain them. No ICU reinterpretation was added to existing `t()` messages.

Local advisory logs and intermediate evidence remain in `.internal/reviews/localization-2026-10-11/` and are not
part of the source commit. Model advice is not acceptance evidence.

## Implemented behavior

Settings → Appearance → Language offers independent interface and conversation selectors. Main saves schema-1
preferences in `userData/language-preferences.json`, serializes updates, and broadcasts committed revisions to
all desktop windows. No raw translated strings cross language IPC. Existing replaceable settings data cannot
clobber language preferences. `system` follows the first supported OS preference, retaining its region for Intl
formatting; Chinese script and Portuguese aliases resolve deterministically. `auto` adds no conversation prompt.

Renderer catalogs load lazily with cached/in-flight deduplication and stale-result guards. Main and mini-chat
wait for initial resolution, with a bounded startup fallback. Failed catalog loads retain the saved preference
while showing English. Native menus, recovery dialogs, and tray presentation use packaged generated subsets.
Action IDs, roles, accelerators, user titles, filenames, raw diagnostics, and tool output retain their meaning.

All catalogs preserve the typed literal interpolation facade. Explicit plural, number, date, and relative-time
formatters are separate APIs. CI rejects missing/unknown/duplicate decoded keys, empty values, non-NFC text,
changed placeholders, unreviewed identical English values, and stale generated native subsets. Shared spelling
exceptions are explicit reviewed technical identifiers, examples, brands, cognates, or established developer
terminology. Non-ASCII translation characters are stored as JSON escapes to preserve the repository file policy.

## Runtime compatibility

The previously pinned signed runtime 7.10.2 lacks a `system` field on command input. The pin is upgraded to the
published stable 7.24.4. Root and three workspace package versions follow the existing runtime-version contract.
The SDK remains exact published JSR 2.6.7; no runtime implementation or provider default is forked here.

All five official release archives and Minisign files were downloaded and checked against the pinned byte sizes,
SHA-256 digests, and repository Minisign public key: darwin-arm64, linux-arm64, linux-x64, win32-arm64, win32-x64.
The verified macOS binary reports 7.24.4. A loopback model-provider fixture exercised real prompt and command
requests with it: both preferences arrived, original user text/arguments remained, and project instructions
remained in the main model prompt. The fixture uses a large declared context window for the real runtime tool
surface; generated response quality and model compliance with a language preference were not evaluated.

## Qualification boundaries

Catalog completeness, automated rendering, and model-authored translations do not constitute native-speaker
approval. The setting applies a preference, not an enforcement guarantee. Explicit user/project instructions
continue to take precedence. Existing content and raw evidence are not translated retrospectively.

This task qualifies local macOS code/build behavior. Download/signature verification of Windows and Linux
artifacts does not demonstrate execution there, nor signed desktop install/update/rollback qualification.
Public release policy remains shadow-only; no remote push or publication is included.

## Recorded validation

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| `pnpm check:locales` | 14 locales, 4,327 exact keys, 56,251 non-English entries; 100 native messages per locale |
| `pnpm test` | 429 files passed; 2,929 tests passed, 1 pre-existing skip |
| Final language/native regressions after the final native-role mapping | 27 tests passed across four files |
| `pnpm typecheck` and `pnpm lint` | Passed on final source |
| `pnpm check:boundaries` | Passed, including IPC, SDK/runtime pins, ownership, and shadow-only release contract |
| `actionlint .github/workflows/*.yml` | Passed |
| `pnpm build` | Passed; renderer assets copied, main/preload/server bundled, Electron native addon rebuilt |
| Built locale assets | All thirteen non-English lazy chunks present |
| Electron 42 rendering fixture | All fourteen locales rendered at 420px; language dropdowns contain all options and preserve independent choices; expanded text wraps without horizontal overflow |
| Electron native menu fixture | All fourteen locale menus retain translated Settings/Undo/Hide Others labels after actual `Menu.buildFromTemplate` |
| Verified runtime loopback probe | Real 7.24.4 prompt and command system preferences arrived with original arguments and project instructions preserved |
| `git diff --check` | Passed |

The full test run preceded the final additional native Hide Others string; the final native/catalog-switch and
conversation tests were rerun after that change. Typecheck, lint, catalog validation, and build were rerun on
final source. The build found inconsistent JSON import attributes between renderer and shared policy; aligning
attributes removed that warning. Existing unrelated test deprecation warnings and the known large lazy Shiki
chunk warning are not localization acceptance failures.

Rendering uses the production LanguageSettings/I18nProvider in an isolated Electron fixture with a private
user-data directory. It is not a signed installation or a full portfolio workflow acceptance run. Screenshots,
CLI reviews, provider probe records, and command logs remain local under the review directory. Generated test
fixture pages and the task-owned development server are removed/stopped before the source commit. Original
user work and reference projects remain untouched.
