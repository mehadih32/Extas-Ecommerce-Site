# shellcheck shell=bash
# PR 6 / PR 4 (follow-up 82) — which images a rollback needs, and which old images may go. Sourced by
# infra/deploy/deploy.sh; tested in infra/tests/run.sh with plain files (no Docker needed).
#
# Every version has two images built from one commit: extas-web:<sha12> (the app) and extas-migrate:<sha12> (the
# migrations, and the background worker, PR 6). A rollback starts the previous good version again, the app AND its
# worker, so both of its images must still be on the server. The deploy record (state/last-good-deploy.json) names
# them: `image` and `worker_image` for the live version, `previous` and `previous_worker` for the rollback target.
# The clean-up after a deploy keeps the newest few of each kind and never removes an image a record names.

# The worker image of a version: the record's own name, else the migrate image of the same commit (records from before
# follow-up 82 have no worker_image; the tag is the commit, the same for both images).
#   worker_image_of <web image> [<recorded worker image>]
worker_image_of() {
  if [ -n "${2:-}" ]; then printf '%s\n' "$2"; else printf 'extas-migrate:%s\n' "${1##*:}"; fi
}

# The rollback target from a deploy record: "<web image> <worker image>", or nothing when there is no previous version.
#   rollback_target <last-good-deploy.json>
rollback_target() {
  local web worker
  # R1 ops review (M3): a record a rollback wrote has no target (its `previous` in older records is the broken version).
  [ "$(jq -r '.kind // empty' "$1" 2>/dev/null || true)" != rollback ] || return 0
  web="$(jq -r '.previous // empty' "$1" 2>/dev/null || true)"
  [ -n "$web" ] || return 0
  worker="$(jq -r '.previous_worker // empty' "$1" 2>/dev/null || true)"
  printf '%s %s\n' "$web" "$(worker_image_of "$web" "$worker")"
}

# Every image the records still need (the live version and its rollback target, web and worker), one per line.
#   needed_images <deploy record>...
needed_images() {
  local f web
  for f in "$@"; do
    [ -s "$f" ] || continue
    for web in "$(jq -r '.image // empty' "$f" 2>/dev/null || true)" "$(jq -r '.previous // empty' "$f" 2>/dev/null || true)"; do
      [ -n "$web" ] || continue
      printf '%s\n' "$web"
    done
    jq -r '.migrate // empty, .worker_image // empty' "$f" 2>/dev/null || true
    web="$(jq -r '.image // empty' "$f" 2>/dev/null || true)"
    [ -z "$web" ] || worker_image_of "$web" "$(jq -r '.worker_image // empty' "$f" 2>/dev/null || true)"
    web="$(jq -r '.previous // empty' "$f" 2>/dev/null || true)"
    [ -z "$web" ] || worker_image_of "$web" "$(jq -r '.previous_worker // empty' "$f" 2>/dev/null || true)"
  done | grep -v '^$' | sort -u
}

# The old images to remove: from "<repo:tag> <created>" lines on stdin (docker images --format), all but the newest
# <keep>, and never one in the <needed> file.
#   images_to_remove <keep> <needed file>
images_to_remove() {
  sort -k2 -r | awk -v keep="$1" 'NR>keep{print $1}' | grep -vxF -f "$2" || true
}
