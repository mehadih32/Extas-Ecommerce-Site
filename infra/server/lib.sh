#!/usr/bin/env bash
# Shared helpers for the EXTAS server scripts. Sourced, never run.
# Every step is idempotent: it checks the current state first and only changes what differs.

EXTAS_REPO_DIR="${EXTAS_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=../config/server.conf
. "${EXTAS_CONFIG_FILE:-$EXTAS_REPO_DIR/infra/config/server.conf}"

EXTAS_STATE_DIR="$EXTAS_ROOT/state"
EXTAS_SECRETS_DIR="$EXTAS_ROOT/config/secrets"
EXTAS_REPORT_DIR="$EXTAS_ROOT/reports"
REPORT_FILE="${REPORT_FILE:-/tmp/extas-report.md}"

log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
die()  { log "ERROR: $*"; exit 1; }

# report <OK|FAIL|SKIP|WARN|INFO> <step> <detail> — one line in the machine report (no secrets, ever)
report() {
  local status="$1" step="$2" detail="${3:-}"
  printf '| %s | %s | %s |\n' "$step" "$status" "${detail//|/\\|}" >> "$REPORT_FILE"
  log "$status $step — $detail"
}

need_root() { [ "$(id -u)" -eq 0 ] || die "run as root (sudo)"; }

# write_file <path> <mode> — writes stdin to path only if the content differs; prints "changed" if it did
write_file() {
  local path="$1" mode="${2:-0644}" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if [ -f "$path" ] && cmp -s "$tmp" "$path"; then rm -f "$tmp"; return 0; fi
  mkdir -p "$(dirname "$path")"
  install -m "$mode" "$tmp" "$path"
  rm -f "$tmp"
  echo changed
}

# gen_secret <file> <KEY> [length] — creates KEY=random in a 600 secrets file once; never prints it
gen_secret() {
  local file="$1" key="$2" len="${3:-32}" val
  mkdir -p "$(dirname "$file")"; chmod 700 "$(dirname "$file")"
  touch "$file"; chmod 600 "$file"
  if grep -q "^${key}=" "$file"; then return 0; fi
  val="$(head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c "$len")"
  printf '%s=%s\n' "$key" "$val" >> "$file"
}

# secret_get <file> <KEY>
secret_get() { grep "^${2}=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }

apt_install() {
  local missing=() p
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  [ ${#missing[@]} -eq 0 ] && return 0
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${missing[@]}" >/dev/null
}

# gib_to_mib <float-ish GiB as integer or x.y> -> MiB integer
mib() { awk -v g="$1" 'BEGIN{printf "%d", g*1024}'; }
