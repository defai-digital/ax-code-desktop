# AkiTTY Web source snapshot

Canonical source: https://github.com/defai-digital/akitty/tree/27ff1eac3650807bcaa76f1f63bba00988c85e31/packages/akitty-web

Desktop consumes the AkiTTY v1.4.1 release (Web package version 0.6.12) at commit
`27ff1eac3650807bcaa76f1f63bba00988c85e31` under ADR-024.
`SOURCE.json` records SHA-256 hashes of the imported files. They are byte-identical to that commit, including the
upstream tests, README and PROVENANCE. The README's npm instructions apply to upstream; in Desktop use pnpm.
The renderer loads `akitty-vt.wasm`, the shared AkiTTY Rust VT engine, as a same-origin asset.
`wasm-provenance.json` records the binary hash and upstream build inputs. Rebuild the binary in the canonical
AkiTTY workspace, where the Rust crate and build tooling live. Desktop includes the AkiTTY, historical Ghostty,
and embedded Rust dependency license texts in the renderer distribution.

Desktop owns only package.json (pnpm catalogs and verification hook), SOURCE.json, UPSTREAM.md and
scripts/verify-source.mjs. The upstream package-lock.json, the browser Playwright suite (`browser/`,
`playwright.config.ts`) and its `@playwright/test` and `vite` dev dependencies are intentionally excluded. No terminal
implementation patches are carried.

## Updating

1. Select and review an exact AkiTTY commit, including its package diff, licenses and wasm provenance.
2. Download its Git archive and replace the imported files, removing files deleted upstream. Do not copy node_modules or package-lock.json.
3. Regenerate SOURCE.json hashes from that archive and record the commit, version and directory. Preserve the Desktop package.json adaptations.
4. Use pnpm install to update the workspace lockfile. Run root boundaries, locales, typecheck, lint, tests and build, plus the native UI smoke.
5. Update both NOTICE files and record validation evidence. Implement terminal fixes upstream before updating this snapshot.
