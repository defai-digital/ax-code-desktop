# Windows shadow signing repair (2026-10-12)

Run 38197553603, job 114644761941 authenticated to Azure Key Vault and retrieved the expected certificate. Packaging failed with AzureSignTool error 800B0003 because electron-builder selected Linux ELF `.node` prebuilds inside the pinned runtime for Authenticode signing.

The signing hook and PowerShell signature auditor now share a binary classifier. Every PE executable, DLL, and native addon remains subject to certificate and timestamp verification. Only recognized ELF or Mach-O `.node` files under `resources/ax-code/node_modules/**/prebuilds/linux-*` or `darwin-*` are preserved without Authenticode changes. Windows prebuilds and malformed or misplaced binaries fail closed. The pinned runtime payload is not pruned.

Local validation: 14 focused signing/classification tests passed, including a sign-hook regression proving foreign prebuilds never invoke AzureSignTool while PE files invoke signing and independent PowerShell verification. Root script tests passed (126 passed, 4 PowerShell-only tests skipped on macOS). All boundary, runtime syntax, runtime-pin, and release-contract checks passed. Real PowerShell and Azure signature verification remains a Windows CI gate.
