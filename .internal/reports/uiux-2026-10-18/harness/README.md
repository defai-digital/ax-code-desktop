# Supervision renderer fixture

Run from the repository root after `pnpm install --frozen-lockfile`:

```sh
node .internal/reports/uiux-2026-10-18/harness/build.mjs
env -u ELECTRON_RUN_AS_NODE pnpm --dir desktop/packages/electron exec electron "$PWD/.internal/reports/uiux-2026-10-18/harness/run.cjs"
```

`AX_UIUX_DIST` overrides the temporary renderer build directory; `AX_UIUX_EVIDENCE` overrides the screenshot/results directory. The runner serves the fixture on an ephemeral loopback port and uses a temporary Electron profile. It does not launch or contact a coding runtime. Runtime actions are stubbed at the build boundary. Shared persistence may emit expected missing-home/settings warnings because the fixture has no backend.

The fixture renders the real board header/row, permission card, navigation and inspector components with their real styles and translations. It verifies 420/760/1440 CSS-pixel windows, both densities, all six states, scope disclosure, expanded tool labels, and German labels at 420px. Results record Electron/Chromium versions. Screenshots use the native display scale and can have more physical pixels than the window's CSS width.

The fixture board does not replace the full `MissionControl` behavioral tests. It does not qualify a packaged application, live runtime, native installation, updater, or screen-reader behavior. The first row's action labels and the workspace text are fixture content. No live project data is captured.
