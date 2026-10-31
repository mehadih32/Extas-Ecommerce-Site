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

# report_json <report file> <out.json> <full: yes|no> <commit> — PR 394: the setup report as data for the admin's
# go-live checklist (Settings → System → Go-live): every step's line, the counts, and whether the run was a full one
# (every A2.9 step) and passed. Written atomically; nothing but the report's own words (no secrets, ever).
report_json() {
  local src="$1" out="$2" full="$3" commit="$4"
  mkdir -p "$(dirname "$out")"
  sed -n 's/^| \(.*\) | \(OK\|FAIL\|SKIP\|WARN\|INFO\) | \(.*\) |$/\1\t\2\t\3/p' "$src" \
    | jq -R 'split("\t") | {step: .[0], status: .[1], detail: (.[2] | gsub("\\\\[|]"; "|"))}' \
    | jq -s --arg at "$(date -Is)" --arg commit "$commit" --argjson full "$([ "$full" = yes ] && echo true || echo false)" \
      '{at: $at, commit: $commit, full: $full,
        counts: {ok: map(select(.status == "OK")) | length, fail: map(select(.status == "FAIL")) | length,
                 warn: map(select(.status == "WARN")) | length},
        steps: .} | .passed = (.full and .counts.fail == 0 and (.steps | length) > 0)' > "$out.tmp" \
    && mv "$out.tmp" "$out"
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

# env_set <file> <KEY> <value> — sets KEY=value in a 600 env file: replaces the existing line (or adds one), keeps every
# other line, rewrites only when something differs. For values derived from secrets (connection strings): the value
# reaches awk through its environment, never through a command line (ps) or the output.
env_set() {
  local file="$1" key="$2" tmp
  mkdir -p "$(dirname "$file")"
  touch "$file"; chmod 600 "$file"
  tmp="$(mktemp)"
  ENV_SET_VALUE="$3" awk -v k="$key" '
    BEGIN { v = ENVIRON["ENV_SET_VALUE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 }; next }
    { print }
    END { if (!done) print k "=" v }' "$file" > "$tmp"
  if cmp -s "$tmp" "$file"; then rm -f "$tmp"; return 0; fi
  install -m 0600 "$tmp" "$file"
  rm -f "$tmp"
}

apt_install() {
  local missing=() p
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  [ ${#missing[@]} -eq 0 ] && return 0
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${missing[@]}" >/dev/null
}

# gib_to_mib <float-ish GiB as integer or x.y> -> MiB integer
mib() { awk -v g="$1" 'BEGIN{printf "%d", g*1024}'; }
