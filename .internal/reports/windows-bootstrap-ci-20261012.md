# Windows Bootstrap CI Module Loading

User-reported job: `38197546897/114643571634`, source `230de546`.

The Windows native-smoke bootstrap suite failed before collecting tests with `SyntaxError: Invalid or unexpected token`. Reproduced locally by converting only `.internal/deploy/distribution.mjs` to CRLF and running the same Vitest suite. That imported module starts with a shebang; the test runner cannot load its CRLF form. The unchanged LF form loads correctly. This is a module-loading failure, not an installer assertion or signing-credential failure.

Pinned `.mjs` files to LF at checkout using `.gitattributes`. Also pinned shell scripts to LF because the signed Windows packaging job invokes them through Bash. Preserved the existing `resources/keys/ax-minisign.pub -text` rule and public-key bytes. No source normalization, dependency change, installer gate removal, or test skip was introduced.

Validation: all 126 root script tests passed (4 PowerShell-dependent tests skipped on this host). A separate `git -c core.autocrlf=true checkout-index` fixture preserved LF in both the imported module and shell signer, preserved exact public-key bytes, and successfully collected the bootstrap suite. Native Windows assertions remain for the new CI run.
