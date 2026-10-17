# Windows setup investigation

The user reported that Windows setup was not working; exact OS/architecture, installer version, failing stage and error text were requested. Until supplied, no claim is made to reproduce the identical incident.

A completed Muse CLI review identified launch-path and cleanup defects. `cmd.exe` expanded literal percent pairs in chosen install paths, Windows PATH discovery could select extensionless Unix launchers and omitted `.bat`, and nonzero taskkill status was treated as success. These paths are fixed with literal launcher environment indirection, disabled delayed expansion, Windows executable suffix selection and checked exit status. Installer cleanup is best-effort so a Defender/file-lock cleanup error cannot replace installer success or the original verification error. Wiki window export cleanup waits for closure and retries file locks once per export.

Regression coverage includes an actual Windows-only batch-launch test under a percent/ampersand/exclamation path, comparing old and corrected invocations. PowerShell tests simulate denied cleanup on both successful installation and signature rejection. Native qualification installs to a path containing spaces and launches the actual installed graphical executable after fresh install, upgrade and final install. It requires bundled runtime selection, runtime health, renderer load and first paint. The existing CLI/ASAR and baseline/rollback/profile/configuration checks remain required.

Native Windows x64 remains the supported target. Windows ARM64 remains explicitly rejected by the bootstrap. Hosted silent NSIS transitions and GUI readiness do not establish interactive wizard or SmartScreen behavior on the reporter's machine.
