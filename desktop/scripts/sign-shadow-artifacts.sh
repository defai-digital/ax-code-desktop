#!/usr/bin/env bash

# Add detached Minisign signatures before staged AX Code Desktop artifacts are uploaded.
# Platform signatures are audited in each native build job. The finalizer repeats
# detached signing and verification before recording the complete candidate set.

set -euo pipefail

ARTIFACT_DIR="${1:-}"
SIGNING_MODE="${AX_CODER_SHADOW_SIGNING_MODE:-unsigned}"

if [[ -z "$ARTIFACT_DIR" || ! -d "$ARTIFACT_DIR" ]]; then
  echo "error: a shadow artifact directory is required" >&2
  exit 1
fi

if [[ "$SIGNING_MODE" == "unsigned" ]]; then
  if find "$ARTIFACT_DIR" -maxdepth 1 -type f -name '*.minisig' -print -quit | grep -q .; then
    echo "error: unsigned shadow artifact directory already contains Minisign signatures" >&2
    exit 1
  fi
  echo "Unsigned shadow mode: detached signing was not requested."
  exit 0
fi

if [[ "$SIGNING_MODE" != "required" ]]; then
  echo "error: AX_CODER_SHADOW_SIGNING_MODE must be unsigned or required" >&2
  exit 1
fi

if [[ -z "${AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64:-}" ]]; then
  echo "error: AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64 is required" >&2
  exit 1
fi
if [[ -z "${AX_CODE_DESKTOP_MINISIGN_PASSWORD:-}" ]]; then
  echo "error: AX_CODE_DESKTOP_MINISIGN_PASSWORD is required" >&2
  exit 1
fi

windows_key_acl() {
  local native_path native_script
  native_path="$(cygpath -w "$1")"
  native_script="$(cygpath -w "$(dirname "${BASH_SOURCE[0]}")/private-key-acl.ps1")"
  AX_DESKTOP_PRIVATE_PATH="$native_path" powershell.exe -NoProfile -NonInteractive \
    -File "$native_script" -Mode "$2"
}

TEMP_BASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
KEY_DIRECTORY="$(mktemp -d "$TEMP_BASE/ax-coder-shadow-sign.XXXXXX")"
SECRET_KEY="$KEY_DIRECTORY/ax.minisign.key"
cleanup() {
  rm -rf -- "$KEY_DIRECTORY"
}
trap cleanup EXIT
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) windows_key_acl "$KEY_DIRECTORY" Protect ;;
  *) chmod 700 "$KEY_DIRECTORY" ;;
esac

if printf '%s' "$AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64" | base64 --decode > "$SECRET_KEY" 2>/dev/null; then
  :
else
  printf '%s' "$AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64" | base64 -D > "$SECRET_KEY"
fi
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) windows_key_acl "$SECRET_KEY" Protect ;;
  *) chmod 600 "$SECRET_KEY" ;;
esac

FILES=()
while IFS= read -r -d '' file; do
  FILES+=("$file")
done < <(find "$ARTIFACT_DIR" -maxdepth 1 -type f ! -name '*.minisig' -print0 | sort -z)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "error: no shadow artifacts found in $ARTIFACT_DIR" >&2
  exit 1
fi

AX_CODE_DESKTOP_MINISIGN_PASSWORD="$AX_CODE_DESKTOP_MINISIGN_PASSWORD" \
  bash desktop/scripts/minisign-artifacts.sh \
    --secret-key "$SECRET_KEY" \
    --public-key resources/keys/ax-minisign.pub \
    --force \
    "${FILES[@]}"

for file in "${FILES[@]}"; do
  if [[ ! -f "${file}.minisig" ]]; then
    echo "error: missing detached signature for $file" >&2
    exit 1
  fi
done

echo "Signed and verified ${#FILES[@]} shadow artifact(s)."
