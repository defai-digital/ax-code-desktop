# AkiTTY Web source contract v1

Status: Accepted implementation contract for the maintainer-requested migration, 2026-10-30.
Decision: [ADR-024](../adr/ADR-024-consume-akitty-web-source.md).

1. Pin defai-digital/akitty commit d7f23f54c236515ec4c325ba838517b5ec29d632, subdirectory packages/akitty-web, package version 0.5.0.
2. Import all package files except package-lock.json and package.json without modification. Package.json retains source/wasm exports and scripts, uses catalog versions for shared dependencies, and runs source verification before typechecking.
3. SOURCE.json records the repository, commit, subdirectory, version and SHA-256 of every imported file. Verification rejects missing, changed or additional files under imported source directories. Desktop-only packaging/provenance files are explicitly identified in UPSTREAM.md.
4. Continue resolving @ax-code/akitty-web through workspace:*; serve the wasm from the app origin under the existing CSP. Ghostty identifiers describe the retained VT engine and are not a second terminal dependency.
5. Run all root gates and the native WebMCP development smoke. Report fixture/unit evidence separately from real PTY and packaged application qualification.
