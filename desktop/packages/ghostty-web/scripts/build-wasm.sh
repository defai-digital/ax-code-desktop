#!/usr/bin/env bash
# Rebuilds ghostty-vt.wasm from the pinned Ghostty commit plus patches/ghostty-wasm-api.patch.
#
# Adapted from upstream coder/ghostty-web scripts/build-wasm.sh. Upstream builds inside a git submodule; this package
# does not vendor Ghostty, so the pinned commit is fetched into a temporary directory instead. The pins live in
# UPSTREAM.md and must change together with the patch and the committed wasm.
set -euo pipefail

GHOSTTY_REPOSITORY="https://github.com/ghostty-org/ghostty.git"
GHOSTTY_COMMIT="5714ed07a1012573261b7b7e3ed2add9c1504496"
ZIG_VERSION="0.15.2"

package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v zig >/dev/null 2>&1; then
  echo "error: zig ${ZIG_VERSION} is required (https://ziglang.org/download/)" >&2
  exit 1
fi
if [ "$(zig version)" != "${ZIG_VERSION}" ]; then
  echo "error: zig ${ZIG_VERSION} is required, found $(zig version)" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

git -C "${work_dir}" init --quiet ghostty
git -C "${work_dir}/ghostty" fetch --quiet --depth 1 "${GHOSTTY_REPOSITORY}" "${GHOSTTY_COMMIT}"
git -C "${work_dir}/ghostty" checkout --quiet FETCH_HEAD
git -C "${work_dir}/ghostty" apply "${package_dir}/patches/ghostty-wasm-api.patch"

(cd "${work_dir}/ghostty" && zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall)

cp "${work_dir}/ghostty/zig-out/bin/ghostty-vt.wasm" "${package_dir}/ghostty-vt.wasm"
echo "built ghostty-vt.wasm"
shasum -a 256 "${package_dir}/ghostty-vt.wasm"
