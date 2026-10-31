# S21 · PR 418 (REP-07e) — the smoke test's newest run of each kind for Reports › Site health › Smoke runs (sourced by
# infra/deploy/smoke.sh and the infra tests). The admin reads state/smoke-runs/<deploy|scheduled>/ through the app's
# read-only /state mount: result.json, rows.json (each page × screen, tools/smoke.mjs) and the pictures.
# shellcheck shell=bash

# smoke_slot <kind>: "deploy" for the run after a deploy, "scheduled" for every other (nightly, first week, by hand).
smoke_slot() {
  case "${1:-}" in
    "after deploy") echo deploy ;;
    *) echo scheduled ;;
  esac
}

# smoke_keep <out-dir> <runs-dir> <slot>: puts the run's result.json, rows.json and *.jpg in <runs-dir>/<slot>, in
# place of that slot's previous run (built aside and moved in, so the admin never reads half a run). Files are readable
# by the app (0644); only those three kinds of file are copied. Returns 1 when the run wrote no result.json.
smoke_keep() {
  local out="$1" dir="$2" slot="$3" tmp f
  [ -f "$out/result.json" ] || return 1
  mkdir -p "$dir"
  chmod 0755 "$dir"
  tmp="$(mktemp -d "$dir/.$slot.XXXXXX")"
  for f in "$out"/result.json "$out"/rows.json "$out"/*.jpg; do
    [ -f "$f" ] && [ ! -L "$f" ] && cp "$f" "$tmp/"
  done
  chmod 0755 "$tmp"
  find "$tmp" -type f -exec chmod 0644 {} +
  if [ -d "$dir/$slot" ]; then
    mv "$dir/$slot" "$dir/.$slot.old.$$"
  fi
  mv "$tmp" "$dir/$slot"
  rm -rf "${dir:?}/.$slot.old.$$"
}
