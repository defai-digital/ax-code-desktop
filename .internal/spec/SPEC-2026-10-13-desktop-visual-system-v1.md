# Desktop Visual System v1

Status: Implemented (all stages, 2026-10-13). Records the look-and-feel rules and how each stage landed.
Date: 2026-10-13
Scope: AX Coder Desktop renderer (`desktop/packages/ui`) and Electron window chrome (`desktop/packages/electron`).
Out of scope: product surfaces such as the portfolio sidebar and exception inbox. Those need an accepted PRD first.

## Sources

- Code audit of `desktop/packages/ui` on 2026-10-13: tokens, typography, motion, focus, window chrome.
- Reference projects in `.internal/reference/`: OpenChamber 2.3.x (upstream), opencode, goose, openhands, continue, cline.
- Public design write-ups:
  - Linear's LCH theme generation and its 2026 refresh.
  - Vercel Geist.
  - Claude Code desktop's 2026 redesign.
  - Zed agent panel review flow.
  - Electron `BaseWindow` options and macOS 26 notes.
- Design reviews with Grok and Muse on every change below.

## Rules in force

These are implemented and covered by tests. Change them only by superseding this spec.

1. **Window chrome.**
   - On macOS every app window uses `titleBarStyle: "hidden"`, with the traffic lights inside the renderer header.
     Do not use `hiddenInset`; Electron adds its own inset and the lights land below the header.
   - The lights sit at `{14,15}` in a 44px bar on macOS 26+, and in a 56px bar before that. The position is re-asserted
     after minimize, restore and fullscreen exit. Nothing is re-asserted while fullscreen.
   - Headers reserve the lights with pixel units: an 88px inset and a 44px or 56px height floor. The interface
     font setting scales `rem`, so `rem` must not be used for this clearance.
   - In fullscreen, only the inset is dropped; the header height stays the same.
   - Windows and Linux keep the native frame.
   - Owner: `electron/src/desktop-window-chrome.js`.
2. **First paint.**
   - The native window background comes from the persisted theme canvas (`splashBgDark` / `splashBgLight`). Only
     opaque `#RGB` or `#RRGGBB` colours are accepted.
   - The boot splash defaults and the `.dark` fallback tokens match the default AutomatosX theme.
   - The launch animation keeps its own dark artwork surface.
3. **Drag regions.** Every top-level screen that renders without the main Header needs `DesktopTitlebarDragStrip`.
4. **Focus.** Focus rings in the AutomatosX themes are opaque. A base `:focus-visible` outline applies to buttons,
   links, `summary`, `select`, non-text inputs, and ARIA button/tab/switch/checkbox/radio roles, unless the element
   carries its own `focus:` or `focus-visible:` utility. Text fields and menu items are excluded.
5. **Motion.**
   - Use compositor-only properties: opacity, and transform where no layout depends on it.
   - Every CSS animation needs a `prefers-reduced-motion` override.
   - `motion/react` runs under `MotionConfig reducedMotion="user"`.
   - No per-character JS animation in streaming paths.
   - Streamed markdown blocks fade in once, decided when they mount. Blocks present when a message mounts never animate.
6. **No CSS masks** in `index.css` or the known Electron risk paths
   (`components/ui/__tests__/scroll-shadow-css.test.ts`).
7. **Glass.** Do not adopt Liquid Glass. Electron has no supported API, and `electron-liquid-glass` relies on private
   AppKit views. Surfaces over the streaming transcript stay opaque; blur there repaints every streamed frame.

## Staged plan

Each stage is a separate reviewed change. Stage order is the recommendation, not a commitment.

### Stage 2: type scale (implemented 2026-10-13, `9719ee30`)

- **Problem.** The semantic sizes are 12, 13, 13, 14, 15, 15px.
  - `--text-ui-header` equals `--text-markdown`.
  - `.typography-h1/h2/h3` all use the markdown size and differ only by weight.
- **Proposal.**
  - Body 14px, code 12–13px.
  - A distinct heading ramp: 16/18/20px, with `.typography-title` at about 20px.
  - Line heights relative to font size, so the font-size setting does not cramp lines.
- **Risks and how to judge them.** Density changes in every view, and saved font-size preferences must keep their
  meaning. Judge it with before/after screenshots of chat, settings and the diff view in both themes.
- **Outcome.**
  - The owner kept the 15px body.
  - Markdown headings render 20/17/15px (h1/h2/h3) with unitless line heights.
  - Every theme line-height variable is `calc(<paired font size> * ratio)`. That keeps the default pixels and scales
    with the font setting. As lengths, these values also inherit unchanged into children of other sizes.

### Stage 3: surface and elevation tokens (implemented 2026-10-13)

- **Radius.**
  - Collapse the seven arbitrary radii and the squircle class hack into `--radius-*`.
  - Use `corner-shape: squircle` only through one utility.
- **Shadows.** Move the copy-pasted six-layer shadow (toast, select, dropdown) into `--shadow-popover` light/dark
  tokens. Toasts keep the inline pin that stops Sonner's focus style from replacing them.
  - Done in `a3cb2860`: `--elevation-popover` with the `shadow-popover` utility.
  - Done in `2e39b654`: the squircle hack became a `.squircle` class.
- **Separation.** The default dark border on canvas is about 1.2:1, so surfaces separate mostly by tone. Decide
  between hairline borders and tone steps, and write the rule into the theme documentation. Upstream's rules are a
  starting point:
  - The sidebar is darker than the canvas.
  - Elevated surfaces are lighter in dark mode.
  - The user bubble is tinted with the primary colour.
  - Code backgrounds stay within about 1.10 contrast of the canvas.
  - Done in `253a4b52`: hairline borders. The dark border moved to #292929, matching the light theme's 1.36:1;
    surface tones are unchanged. The rule is documented in CUSTOM_THEMES.md.

### Stage 4: theme generation (implemented 2026-10-13, `617b32b8`)

- Generate a theme from three inputs: base, accent and contrast, in OKLCH (Linear's model).
- Hand-written themes stay supported.
- Add a contrast check over every bundled theme for text and focus indicators (WCAG 1.4.3 and 1.4.11).
- **Outcome.**
  - `lib/theme/oklch.ts`, `generateTheme.ts` and `themeContrast.ts` are in place. A test audits every bundled theme:
    body and button text must reach 4.5:1.
  - Ten light themes had pastel button text and were fixed in `b82c9742`; git ref badges now use the canvas colour.
  - The generator is not exposed in the UI; that is a product decision for a later change.

### Stage 5: transcript polish (Activity fold done 2026-10-13)

- Candidates from upstream and opencode, sized separately:
  - A live turn that shows its last steps with a "+N more" count.
  - A running-to-done verb swap on tool titles ("Reading" becomes "Read").
  - A context-usage ring.
- Each candidate is judged against what the fork already does, so it does not duplicate existing turn behaviour.
- **Done (2026-10-13).**
  - `a32619f3`: the sorted chat mode is retired.
  - `895ff4d2`: the live Activity fold ships. It shows the latest 7 rows plus "+N more" and closes into a summary;
    Activity defaults to Expanded.
- **Done.**
  - `9ca8392a` and `9a73b7dc`: the follow stop at the reader's message in collapsed mode.
  - `b510c1ae`: the per-fold message window.

## Verification

Use `pnpm run typecheck`, `lint`, `test`, `check:locales` and `check:boundaries`. Window chrome and motion also need
a dev build check on macOS. The isolated launch recipe:

- Run `node scripts/dev.mjs` directly.
- Use an Electron wrapper that adds `--user-data-dir`.
- Set `AX_CODE_DESKTOP_DATA_DIR`.
- Take screenshots with `screencapture -l <window id>`.

Not yet verified on device: macOS 15 and earlier, Windows and Linux.
