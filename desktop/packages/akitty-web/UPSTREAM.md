# AkiTTY Web source snapshot

Canonical source: https://github.com/defai-digital/akitty/tree/d7f23f54c236515ec4c325ba838517b5ec29d632/packages/akitty-web

Desktop consumes AkiTTY Web 0.5.0 at commit `d7f23f54c236515ec4c325ba838517b5ec29d632` under ADR-024.
`SOURCE.json` records SHA-256 hashes of the imported files. They are byte-identical to that commit, including the
upstream tests, README and PROVENANCE. The README's npm instructions apply to upstream; in Desktop use pnpm.
The wasm remains the Ghostty artifact described in PROVENANCE.md; changing terminal ownership does not replace its VT engine.

Desktop owns only package.json (pnpm catalogs and verification hook), SOURCE.json, UPSTREAM.md and
scripts/verify-source.mjs. The upstream package-lock.json is intentionally excluded. No terminal implementation patches are carried.

## Updating

1. Select and review an exact AkiTTY commit, including its package diff, licenses and wasm provenance.
2. Download its Git archive and replace the imported files, removing files deleted upstream. Do not copy node_modules or package-lock.json.
3. Regenerate SOURCE.json hashes from that archive and record the commit, version and directory. Preserve the Desktop package.json adaptations.
4. Use pnpm install to update the workspace lockfile. Run root boundaries, locales, typecheck, lint, tests and build, plus the native UI smoke.
5. Update both NOTICE files and record validation evidence. Implement terminal fixes upstream before updating this snapshot.
