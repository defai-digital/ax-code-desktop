#!/usr/bin/env bash
#
# Generate the local minisign keypair used for AX Code Desktop release artifacts.

set -euo pipefail

KEY_DIR="${SIGNKEY_DIR:-$HOME/signkey}"
SECRET_KEY="${MINISIGN_SECRET_KEY:-}"
PUBLIC_KEY="${MINISIGN_PUBLIC_KEY:-}"
FORCE=false
NO_PASSWORD=false
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: ./scripts/minisign-keygen.sh [options]

Options:
  --key-dir <path>      Directory for generated keys (default: ~/signkey)
  --secret-key <path>   Secret key path (default: <key-dir>/ax-code-desktop.minisign.key)
  --public-key <path>   Public key path (default: <key-dir>/ax-code-desktop.minisign.pub)
  --force               Overwrite an existing keypair
  --allow-unencrypted-test-key
                        Generate an unencrypted secret key for short-lived tests
  --dry-run             Print what would be done
  --help                Show this help
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
  local chmod_hint="$3"
  local mode

  mode="$(stat_permissions "$path")"
  if (( (8#$mode & 8#077) != 0 )); then
    echo "$label has group/other permission bits set ($mode): $path" >&2
    echo "Run: chmod $chmod_hint '$path'" >&2
    exit 1
  fi
}

public_key_id() {
  awk '/^untrusted comment: minisign public key / { print $NF; exit }' "$PUBLIC_KEY"
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
    --force)
      FORCE=true
      shift
      ;;
    --allow-unencrypted-test-key|--no-password)
      NO_PASSWORD=true
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
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SECRET_KEY="${SECRET_KEY:-$KEY_DIR/ax-code-desktop.minisign.key}"
PUBLIC_KEY="${PUBLIC_KEY:-$KEY_DIR/ax-code-desktop.minisign.pub}"
SECRET_KEY_DIR="$(dirname "$SECRET_KEY")"
PUBLIC_KEY_DIR="$(dirname "$PUBLIC_KEY")"

if ! command -v minisign >/dev/null 2>&1; then
  echo "minisign is not installed. Install it first, for example: brew install minisign" >&2
  exit 1
fi

if [[ "$FORCE" != true ]]; then
  if [[ -e "$SECRET_KEY" || -e "$PUBLIC_KEY" ]]; then
    echo "Refusing to overwrite an existing keypair:" >&2
    echo "  $SECRET_KEY" >&2
    echo "  $PUBLIC_KEY" >&2
    echo "Use --force only if you intentionally want to rotate the signing key." >&2
    exit 1
  fi
fi

MINISIGN_ARGS=(-G -s "$SECRET_KEY" -p "$PUBLIC_KEY")
if [[ "$FORCE" == true ]]; then
  MINISIGN_ARGS+=(-f)
fi
if [[ "$NO_PASSWORD" == true ]]; then
  MINISIGN_ARGS+=(-W)
fi

echo "Key directory: $KEY_DIR"
echo "Secret key:    $SECRET_KEY"
echo "Public key:    $PUBLIC_KEY"

if [[ "$DRY_RUN" == true ]]; then
  printf 'Would ensure private secret-key directory: %q\n' "$SECRET_KEY_DIR"
  printf 'Would ensure public-key directory exists: %q\n' "$PUBLIC_KEY_DIR"
  printf 'Would run: minisign'
  printf ' %q' "${MINISIGN_ARGS[@]}"
  printf '\n'
  exit 0
fi

umask 077
if [[ -d "$SECRET_KEY_DIR" ]]; then
  ensure_private_permissions "$SECRET_KEY_DIR" "Secret key directory" 700
else
  mkdir -p "$SECRET_KEY_DIR"
  chmod 700 "$SECRET_KEY_DIR"
fi
mkdir -p "$PUBLIC_KEY_DIR"

if [[ "$NO_PASSWORD" == true ]]; then
  echo "Warning: generating an unencrypted test key. Do not use it for releases." >&2
else
  echo "minisign will prompt for a secret-key password. Keep it outside shell history and chat."
fi

minisign "${MINISIGN_ARGS[@]}"

chmod 600 "$SECRET_KEY"
chmod 644 "$PUBLIC_KEY"
ensure_private_permissions "$SECRET_KEY_DIR" "Secret key directory" 700
ensure_private_permissions "$SECRET_KEY" "Secret key" 600

echo ""
echo "Generated minisign keypair."
echo "Public key id: $(public_key_id)"
echo "Publish this public key for verification:"
cat "$PUBLIC_KEY"
