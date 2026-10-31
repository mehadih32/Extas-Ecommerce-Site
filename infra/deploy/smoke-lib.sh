# S21 · PR 418 (REP-07e) — the smoke test's newest run of each kind for Reports › Site health › Smoke runs (sourced by
# infra/deploy/smoke.sh, journeys.sh (PR 419: run_history) and the infra tests). The admin reads state/smoke-runs/<deploy|scheduled>/ through the app's
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

# PR 419 (B7.3) — run_history <smoke|journeys> <run folder> <migrate image> <env file>: keeps the run in the history
# (SiteAuditRun with its findings; packages/jobs/src/run-history-cli.ts in the release's migrate image, as the node
# user, the folder read-only). Never fails the caller: a release without the command, or a database that cannot be
# written, is said in one line and the run goes on.
run_history() {
  local tool="$1" dir="$2" img="$3" envf="$4" rc=0
  if ! docker run --rm --name "extas-history-probe-$$" "$img" test -f /repo/packages/jobs/src/run-history-cli.ts >/dev/null 2>&1; then
    echo "run history: this release cannot keep runs yet (no run-history-cli.ts)"
    return 0
  fi
  # shellcheck disable=SC2016  # $1 is the tool, expanded inside the container
  docker run --rm --name "extas-history-$$" --network extas --env-file "$envf" -v "$dir:/in:ro" "$img" \
    sh -c 'cd /repo/packages/jobs && exec ./node_modules/.bin/tsx src/run-history-cli.ts --tool "$1" --dir /in' sh "$tool" || rc=$?
  [ "$rc" -eq 0 ] || echo "run history: not kept (exit $rc)"
  return 0
}
