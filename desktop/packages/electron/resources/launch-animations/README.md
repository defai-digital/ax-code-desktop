# AX Code opening and ending artwork

These 36 paired, silent WebM/VP9 clips are pre-rendered artwork from AX Code's
canonical TUI scene painters. Each clip is 960 x 540, 24 fps, and three seconds
long. The manifest records the producer commit, source-file SHA-256 hashes, and
each media file's SHA-256 hash and size. `LICENSE`, `LICENSE-MIT`, and `NOTICE`
preserve the producer's Apache-2.0 license and upstream attribution.

Producer: `defai-digital/ax-code`, commit
`45b8e49ad01312a4d7cf3c5720978dc0737d6643`.

No TUI component, terminal transport, coding runtime, or dependency from the
producer is shipped here. CI and packaging consume these committed clips.

To regenerate artwork from a clean, explicit producer checkout, install FFmpeg
with the `libvpx-vp9` encoder and run from the Desktop repository root:

```bash
pnpm exec tsx --tsconfig /path/to/ax-code/packages/ax-code/tsconfig.json \
  desktop/scripts/export-launch-animations.mjs --source /path/to/ax-code
pnpm run check:launch-animations
```

The export reads the producer's tracked source and legal texts. It writes only this
Desktop artwork directory. It checks source cleanliness and unchanged source
hashes before recording the manifest. Review regenerated visuals and provenance
before committing a producer update. The export tool is development-only and
is not invoked by CI, builds, packaging, or application startup.
