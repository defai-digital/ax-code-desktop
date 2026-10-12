# Windows shadow signing repair (2026-10-12)

Run 38197553603, job 114644761941 authenticated to Azure Key Vault and retrieved the expected certificate. Packaging failed with AzureSignTool error 800B0003 because electron-builder selected Linux ELF `.node` prebuilds inside the pinned runtime for Authenticode signing.

The signing hook and PowerShell signature auditor now share a binary classifier. Every PE executable, DLL, and native addon remains subject to certificate and timestamp verification. Only recognized ELF or Mach-O `.node` files under `resources/ax-code/node_modules/**/prebuilds/linux-*` or `darwin-*` are preserved without Authenticode changes. Windows prebuilds and malformed or misplaced binaries fail closed. The pinned runtime payload is not pruned.

Local validation: 14 focused signing/classification tests passed, including a sign-hook regression proving foreign prebuilds never invoke AzureSignTool while PE files invoke signing and independent PowerShell verification. Root script tests passed (126 passed, 4 PowerShell-only tests skipped on macOS). All boundary, runtime syntax, runtime-pin, and release-contract checks passed. Real PowerShell and Azure signature verification remains a Windows CI gate.

## Electron unpacked dependency follow-up

Run 38198725939, job 114648664307 successfully signed and verified Windows PE files, then stopped on `resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-x64/pty.node`. The original allowed paths covered the pinned runtime but missed Electron's own unpacked `node-pty` dependency. Extend the foreign-format exception only to this dependency's Linux/macOS prebuild directories. Unrelated unpacked packages, foreign binaries under Windows directories, mismatched platform headers, and malformed binaries still fail closed.

Validation: 18 focused tests passed, including sign-hook coverage for both dependency locations. All eight actual installed node-pty prebuilds were classified correctly (two Darwin addons excluded; six Windows PE addons retained for signing). Root script tests passed (126 passed, four Windows-only tests skipped locally). No binary payloads were deleted or changed.

## Windows ASAR layout follow-up

Run 38199919841 job 114652859914 completed Azure signing and independent certificate/timestamp verification for the application, elevation helper, NSIS uninstaller and final installer. Post-package layout verification then incorrectly reported missing `package.json` because `asar.listPackage` returns Windows-native backslash paths. Normalize list separators before matching canonical archive/header paths; retain all SHA-256, block-integrity, unpacked-code and embedded-anchor checks. Eleven real-ASAR regressions passed, including a Windows-path listing and a genuinely missing package manifest that still fails closed.
