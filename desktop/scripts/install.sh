#!/usr/bin/env bash
# Native AX Code Desktop installer entry.
# Usage: curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
set -euo pipefail

url='https://download.automatosx.com/ax-code-desktop/install'
command -v curl >/dev/null || { echo 'AX Code Desktop: curl is required.' >&2; exit 1; }
temporary="$(mktemp -d "${TMPDIR:-/tmp}/ax-code-desktop-entry.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT

# Retrieve the entire script before executing it. A missing or incomplete
# download must never fall back to the retired npm Web interface package.
if ! curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --fail --silent --show-error --location --retry 3 \
  --connect-timeout 20 --max-time 120 "$url" -o "$temporary/install"; then
  echo 'AX Code Desktop: the native installer is unavailable; nothing was installed.' >&2
  exit 1
fi
if [[ ! -s "$temporary/install" ]]; then
  echo 'AX Code Desktop: the native installer download was empty; nothing was installed.' >&2
  exit 1
fi
bash "$temporary/install" "$@"
