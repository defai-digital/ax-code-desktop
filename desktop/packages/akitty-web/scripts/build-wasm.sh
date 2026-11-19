#!/usr/bin/env bash
# Build the same owned Rust terminal engine used by the native app.
set -euo pipefail
package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "${package_dir}/../../scripts/build-vt-wasm.sh"
cp "${package_dir}/../../build/akitty-vt.wasm" "${package_dir}/akitty-vt.wasm"
cd "${package_dir}/../.."
python3 scripts/dependency-licenses.py --vt
cp build/VT_LICENSES.txt "${package_dir}/ENGINE_LICENSES.txt"
