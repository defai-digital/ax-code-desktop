# Desktop Download Distribution v1

Status: Accepted preparation specification; installation and publication pending.
Related: ADR-010.

## Channels and inventory

Proposed base: `https://download.automatosx.com/ax-code-desktop`.
Versioned objects: `/releases/download/v<VERSION>/<filename>` under that base.
Mutable objects: `install`, `install.ps1`, `latest.json`, platform update feeds.
Use a dedicated Desktop R2 bucket or explicit isolated binding and key prefix;
never overwrite the existing AX Code bucket's root CLI installers or release paths.

| Platform | Architecture | Installation | Additional update/portable artifacts |
| --- | --- | --- | --- |
| macOS 13+ | arm64 | Signed, notarized and stapled DMG | ZIP, blockmaps, latest-mac.yml |
| Windows | x64 only | Authenticode NSIS EXE | ZIP, blockmaps, latest.yml |
| Ubuntu Desktop 24.04+ | amd64 | DEB via apt | x86_64 AppImage, latest-linux.yml |
| Ubuntu Desktop 24.04+ | arm64 | DEB via apt | arm64 AppImage, latest-linux-arm64.yml |

Electron-builder uses `x86_64` for the x64 AppImage and `amd64` for its DEB.
Preserve these actual names and their update metadata rather than renaming assets.
The web compatibility package remains shadow evidence; it is not a GUI installer.

## Proposed operator sequence

1. Select a clean immutable candidate SHA and new Desktop version. Require exact-SHA
   CI and stable Electron; keep SDK/runtime version pins independent.
2. Build all four platform packages with the pinned signed runtime. Required signing
   must fail before building when effective Apple/Azure/Minisign inputs are absent.
3. Verify application and DMG signatures, notarization and stapling on macOS;
   Authenticode publisher/certificate on Windows; signed DEB/AppImage inventory on
   Ubuntu. Run native, packaged runtime and ASAR smokes.
4. Record fresh install, previous-version upgrade, rollback, and data/credential
   continuity evidence on every supported platform. Obtain release-cutover approval.
5. Produce signed installer scripts and signed manifest containing exact version,
   source SHA, allowed filenames, target, size and SHA-256. Pin the release public
   key in the installers; do not trust a newly downloaded key as the trust root.
6. Authenticated upload must reject a different object at an existing immutable
   version key. Verify every uploaded asset anonymously against local size/digest
   and Minisign signature. Write versioned `release-ready.json` last.
7. Atomically switch mutable channel pointers to that qualified version. Versioned
   assets use immutable caching; mutable aliases and missing objects use no-store.
8. Verify both proposed one-line installers from a fresh unauthenticated machine,
   plus Electron generic-feed downloads. Record all evidence before declaring release.

## Installer behavior to implement before publication

The Unix bootstrap uses Bash, HTTPS-only downloads, a temporary directory with
cleanup, and a signed manifest. Reject unsupported OS/architecture before making
changes. Never pipe into `sudo bash`. Prompt/elevate only the final installation.
Require a valid readiness marker and cryptographic checks before opening a package.

On macOS, require arm64, check the signed/stapled DMG and Developer ID team
`N5ZUZDUJS6`, mount read-only, validate the application again, and install the existing
`AX Code.app` identity. Refuse replacement while the app is running; preserve user
data and Keychain entries. Do not remove quarantine or disable Gatekeeper.

On Ubuntu, require Desktop 24.04+, map amd64/arm64 correctly, verify the signed DEB
and run `sudo apt install ./<verified-package>.deb` so dependencies resolve. The
AppImage is optional; never pass `--no-sandbox`. Smoke on a real graphical session
and verify the desktop entry, libsecret integration and bundled worker.

On Windows, provide `install.ps1`; the Bash installer must not install Windows.
Check native OS architecture, rejecting ARM64 even when PowerShell is x64-emulated.
Verify manifest/digest, Authenticode validity and frozen publisher/certificate;
launch the existing NSIS installer and check its exit code. Preserve user scope,
Start Menu/desktop shortcuts and existing application data.

After gateway deployment and qualification, the intended entry points are:

```bash
curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
```

```powershell
irm https://download.automatosx.com/ax-code-desktop/install.ps1 | iex
```

These are proposed commands, not currently working published installers. The
bootstrap depends on HTTPS trust; provide signed download-and-review instructions
alongside the convenient one-line entry points.

## Updater and rollback

Migrate to an anonymous generic Electron feed only after qualification. Produce
the actual platform-specific latest YAML and preserve installer hashes after final
signing/stapling. Confirm blockmap/range support if differential updates are used.
Existing GitHub updater clients may require one manual signed installation to
migrate; a private GitHub repository must not require a token in the installed app.
Test rollback to a preserved signed version without moving immutable tags or
removing profile data. Mutable pointer rollback must reference an already verified
readiness marker. Do not activate this feed through preparation metadata alone.
