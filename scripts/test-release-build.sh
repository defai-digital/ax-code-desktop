#!/usr/bin/env bash
#
# Test Release Build Script (Electron)
#
# Local smoke test for the desktop release build. Builds the web assets and the
# Electron main/preload/server bundle, rebuilds native modules against the
# Electron ABI, then runs electron-builder for the host (or requested) arch.
#
# Usage:
#   ./scripts/test-release-build.sh [arch]
#     arch: aarch64 | arm64 | x86_64 | x64   (default: host arch)
#
set -euo pipefail

cd "$(dirname "$0")/.."

ARCH_ARG="${1:-}"
case "$ARCH_ARG" in
  aarch64|arm64) BUILDER_ARCH="--arm64" ;;
  x86_64|x64)    BUILDER_ARCH="--x64" ;;
  "")            BUILDER_ARCH="" ;;
  *) echo "Unknown arch '$ARCH_ARG' (expected aarch64|arm64|x86_64|x64)"; exit 1 ;;
esac

echo "==> Building web assets"
bun run build:web

echo "==> Bundling + native rebuild (packages/electron)"
bun run --cwd packages/electron build

echo "==> Packaging with electron-builder ${BUILDER_ARCH:-(host arch)}"
case "$(uname -s)" in
  Darwin) PLATFORM="--mac" ;;
  Linux)  PLATFORM="--linux" ;;
  *)      PLATFORM="--win" ;;
esac

# shellcheck disable=SC2086
bunx electron-builder ${PLATFORM} ${BUILDER_ARCH} --publish=never --config packages/electron/electron-builder.yml

echo "==> Done. Artifacts in packages/electron/dist/"
