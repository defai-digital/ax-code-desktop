# Desktop winget manifests

AX Code Desktop owns the `DEFAI.AXCode.Desktop` Windows Package Manager manifest generator. It reads the compatibility release
repository and tag prefix from `config/desktop-release-policy.json` so source ownership does not silently change the
installed application's update channel.

Generate a review-only manifest without downloading release assets:

```bash
pnpm run winget:generate -- --version 7.10.2 --skip-download
```

Omit `--skip-download` only after the matching signed Desktop release assets exist. Generating manifests does not
publish them or bypass the shadow-only release policy.
