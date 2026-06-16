#!/usr/bin/env bash
#
# Sign AX Code Desktop release artifacts with the local minisign keypair.

set -euo pipefail

shopt -s nullglob

KEY_DIR="${SIGNKEY_DIR:-$HOME/signkey}"
SECRET_KEY="${MINISIGN_SECRET_KEY:-}"
PUBLIC_KEY="${MINISIGN_PUBLIC_KEY:-}"
PINNED_PUBLIC_KEY="${AX_CODE_DESKTOP_MINISIGN_PUBLIC_KEY:-RWS+dNbWPLZ6W9TH486c9zdH84NiiuFnm4VpVTRlXoMHClyQx/fY7W2A}"
TRUSTED_COMMENT="${MINISIGN_TRUSTED_COMMENT:-}"
UNTRUSTED_COMMENT="${MINISIGN_UNTRUSTED_COMMENT:-signature from ax-code-desktop local signing key}"
MINISIGN_KEY_PASSWORD="${AX_CODE_DESKTOP_MINISIGN_PASSWORD:-${MINISIGN_PASSWORD:-}}"
KEYCHAIN_SERVICE="${AX_CODE_DESKTOP_MINISIGN_KEYCHAIN_SERVICE:-ax-code-desktop-minisign}"
KEYCHAIN_ACCOUNT="${AX_CODE_DESKTOP_MINISIGN_KEYCHAIN_ACCOUNT:-ax-code-desktop-release}"
DRY_RUN=false
VERIFY=true
FORCE=false
FILES=()

usage() {
  cat <<'EOF'
Usage: ./scripts/minisign-artifacts.sh [options] [file ...]

Signs the provided files. With no files, signs conventional release artifacts
under packages/electron/dist and packages/web.

Options:
  --key-dir <path>          Directory containing keys (default: ~/signkey)
  --secret-key <path>       Secret key path (default: <key-dir>/ax-code-desktop.minisign.key)
  --public-key <path>       Public key path (default: <key-dir>/ax-code-desktop.minisign.pub)
  --trusted-comment <text>  Trusted minisign comment
  --untrusted-comment <text>
                            Untrusted minisign comment
  --force                   Replace existing .minisig files
  --no-verify              Skip verification after signing
  --dry-run                Print what would be signed
  --help                   Show this help
EOF
}

stat_permissions() {
  local path="$1"
  if stat -f '%Lp' "$path" >/dev/null 2>&1; then
    stat -f '%Lp' "$path"
    return
  fi
  stat -c '%a' "$path"
}

ensure_private_permissions() {
  local path="$1"
  local label="$2"
  local mode

  mode="$(stat_permissions "$path")"
  if (( (8#$mode & 8#077) != 0 )); then
    echo "$label has group/other permission bits set ($mode): $path" >&2
    echo "Run: chmod 600 '$path'" >&2
    exit 1
  fi
}

public_key_id() {
  awk '/^untrusted comment: minisign public key / { print $NF; exit }' "$PUBLIC_KEY"
}

public_key_material() {
  awk '/^RW/ { print $1; exit }' "$PUBLIC_KEY"
}

minisign_password_from_keychain() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi
  if ! command -v security >/dev/null 2>&1; then
    return 1
  fi
  security find-generic-password -w -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" 2>/dev/null || return 1
}

minisign_password() {
  if [[ -n "$MINISIGN_KEY_PASSWORD" ]]; then
    printf '%s\n' "$MINISIGN_KEY_PASSWORD"
    return 0
  fi
  minisign_password_from_keychain
}

require_pinned_public_key() {
  local actual
  actual="$(public_key_material)"
  if [[ -z "$actual" ]]; then
    echo "Could not read minisign public key material from $PUBLIC_KEY" >&2
    exit 1
  fi
  if [[ "$actual" != "$PINNED_PUBLIC_KEY" ]]; then
    echo "Minisign public key does not match the pinned AX Code Desktop release key: $PUBLIC_KEY" >&2
    echo "Expected: $PINNED_PUBLIC_KEY" >&2
    echo "Actual:   $actual" >&2
    exit 1
  fi
}

sha256_hex() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{ print $1 }'
    return
  fi
  shasum -a 256 "$file" | awk '{ print $1 }'
}

trusted_comment_for_file() {
  local file="$1"
  local basename
  local hash

  if [[ -n "$TRUSTED_COMMENT" ]]; then
    printf '%s\n' "$TRUSTED_COMMENT"
    return
  fi

  basename="$(basename "$file")"
  hash="$(sha256_hex "$file")"
  printf 'AX Code Desktop release artifact: %s; sha256=%s; signed=%s\n' "$basename" "$hash" "$SIGNED_AT"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key-dir)
      KEY_DIR="${2:?Missing value for --key-dir}"
      shift 2
      ;;
    --secret-key)
      SECRET_KEY="${2:?Missing value for --secret-key}"
      shift 2
      ;;
    --public-key)
      PUBLIC_KEY="${2:?Missing value for --public-key}"
      shift 2
      ;;
    --trusted-comment)
      TRUSTED_COMMENT="${2:?Missing value for --trusted-comment}"
      shift 2
      ;;
    --untrusted-comment)
      UNTRUSTED_COMMENT="${2:?Missing value for --untrusted-comment}"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --no-verify)
      VERIFY=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

SECRET_KEY="${SECRET_KEY:-$KEY_DIR/ax-code-desktop.minisign.key}"
PUBLIC_KEY="${PUBLIC_KEY:-$KEY_DIR/ax-code-desktop.minisign.pub}"
SIGNED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! command -v minisign >/dev/null 2>&1; then
  echo "minisign is not installed. Install it first, for example: brew install minisign" >&2
  exit 1
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  FILES=(
    packages/electron/dist/*.dmg
    packages/electron/dist/*.zip
    packages/electron/dist/*.exe
    packages/electron/dist/*.blockmap
    packages/electron/dist/latest*.yml
    packages/electron/dist/*.tar.gz
    packages/web/*.tgz
  )
fi

SIGN_FILES=()
for file in "${FILES[@]}"; do
  if [[ "$file" == *.minisig ]]; then
    continue
  fi
  if [[ -f "$file" ]]; then
    SIGN_FILES+=("$file")
  elif [[ ${#FILES[@]} -gt 0 ]]; then
    echo "Not a regular file: $file" >&2
    exit 1
  fi
done

if [[ ${#SIGN_FILES[@]} -eq 0 ]]; then
  echo "No release artifacts found to sign." >&2
  echo "Pass explicit files or build/package the release artifacts first." >&2
  exit 1
fi

if [[ "$DRY_RUN" != true && ! -f "$SECRET_KEY" ]]; then
  echo "Secret key not found: $SECRET_KEY" >&2
  echo "Generate it with: bun run sign:keygen" >&2
  exit 1
fi

if [[ "$DRY_RUN" != true && "$VERIFY" == true && ! -f "$PUBLIC_KEY" ]]; then
  echo "Public key not found: $PUBLIC_KEY" >&2
  echo "Pass --no-verify to sign without local verification." >&2
  exit 1
fi

if [[ "$DRY_RUN" != true && -f "$PUBLIC_KEY" ]]; then
  require_pinned_public_key
fi

if [[ "$DRY_RUN" != true ]]; then
  ensure_private_permissions "$SECRET_KEY" "Secret key"
fi

echo "Secret key: $SECRET_KEY"
if [[ "$VERIFY" == true ]]; then
  echo "Public key: $PUBLIC_KEY"
  if [[ -f "$PUBLIC_KEY" ]]; then
    echo "Public key id: $(public_key_id)"
  fi
fi
echo "Files:"
for file in "${SIGN_FILES[@]}"; do
  echo "  $file -> $file.minisig"
done

for file in "${SIGN_FILES[@]}"; do
  sig_file="$file.minisig"
  if [[ -e "$sig_file" && "$FORCE" != true ]]; then
    echo "Signature already exists: $sig_file" >&2
    echo "Use --force only when you intentionally want to replace it." >&2
    exit 1
  fi
done

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run only; no signatures were created."
  exit 0
fi

for file in "${SIGN_FILES[@]}"; do
  sig_file="$file.minisig"
  trusted_comment="$(trusted_comment_for_file "$file")"
  password="$(minisign_password || true)"
  minisign_args=(
    -S
    -s "$SECRET_KEY"
    -x "$sig_file"
    -c "$UNTRUSTED_COMMENT"
    -t "$trusted_comment"
    -m "$file"
  )
  if [[ -n "$password" ]]; then
    printf '%s\n' "$password" | minisign "${minisign_args[@]}"
  else
    minisign "${minisign_args[@]}"
  fi
done

if [[ "$VERIFY" == true ]]; then
  for file in "${SIGN_FILES[@]}"; do
    minisign -V -q -p "$PUBLIC_KEY" -m "$file" -x "$file.minisig"
  done
fi

echo "Created signatures:"
for file in "${SIGN_FILES[@]}"; do
  echo "  $file.minisig"
done
