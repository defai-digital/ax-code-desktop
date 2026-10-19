# Desktop localization v2: writing direction

Status: Accepted for implementation on 2026-10-19.
PRD: PRD-2026-10-19-competitive-quality-v1 (Phase 2, item 14). Extends SPEC-2026-10-11-desktop-localization-v1.

## 1. Scope

v2 adds direction-aware rendering. It does not add a right-to-left locale: a locale ships only with a complete catalog
that passes `check:locales`. Arabic is the expected first one, in a later change.

## 2. Locale metadata

- `desktop/shared/locales.json` keeps per-field maps keyed by locale code (`labels`, `conversationNames`), so direction is
  an optional top-level map `"directions": { "<code>": "ltr" | "rtl" }`; absent means `ltr`. `check-locales.ts` rejects
  unknown codes and values. The shared helper `localeDirection(code)` (`desktop/shared/localization.mjs`) returns the
  explicit value, otherwise `"rtl"` for the base languages `ar`, `he`, `fa` and `ur` (including region forms such as
  `ar-EG`), otherwise `"ltr"`.
- `ui/src/lib/i18n/context.tsx` sets `document.documentElement.dir` and `lang` from the active locale instead of the
  fixed `"ltr"`.

## 3. Layout rules

- New and touched styles use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`,
  `text-align: start`) and Tailwind's logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`).
- Code, diffs, terminal output, file paths and Mermaid source keep `dir="ltr"` regardless of the UI direction.
- A dev-only query flag `?dir=rtl` forces RTL for layout review without a translated catalog.

## 4. Tests

Direction helper cases, `dir`/`lang` applied on locale change, code surfaces pinned to LTR, and the dev flag ignored in
production builds.
