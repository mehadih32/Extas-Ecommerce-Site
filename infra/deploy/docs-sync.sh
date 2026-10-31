#!/usr/bin/env bash
# PR 594 (scope update, CN-011) — the repository's docs on the server, one way (repo → server), on every deploy.
#   sudo infra/deploy/docs-sync.sh <commit sha> [<checkout dir>]
# Copies README.md and the whole docs/ folder of the checkout (default: this repository) to
# $EXTAS_ROOT/docs/<sha12>/ with a COMMIT file (the full commit hash, the commit's own time and the copy time in
# EXTAS_TIMEZONE), then points $EXTAS_ROOT/docs/current at it in one step (a rename, so a reader never sees half a
# copy). Files that did not change since the previous copy are hard links to it, so a copy costs only what changed.
# Keeps the newest DOCS_KEEP_VERSIONS copies; older ones are removed: they are only copies of what is in Git and are
# made again from it. Nothing is ever copied from the server back into the repository.
# PR 390: docs/MANUAL.md, the Site manual in one file (manual-md.sh), is made in the copy (never in the checkout).
# Readers: the admin's "PR register" and "Blueprint & files" tabs (PR 594) read /docs/current in the app (app.yml
# mounts $EXTAS_ROOT/docs read-only as /docs, EXTAS_DOCS_DIR); every backup takes a dated docs bundle from it (PR 8).
# Writes state/docs-latest.json and prints one line. Nothing here is secret: everything copied is in Git already.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
SHA="${1:?usage: docs-sync.sh <commit sha> [<checkout dir>]}"
SRC="${2:-$(cd "$HERE/../.." && pwd)}"
[[ "$SHA" =~ ^[0-9a-f]{12,64}$ ]] || { echo "docs-sync: not a commit hash: $SHA" >&2; exit 2; }
[ -f "$SRC/README.md" ] && [ -d "$SRC/docs" ] || { echo "docs-sync: no README.md and docs/ in $SRC" >&2; exit 1; }
D="$EXTAS_ROOT/docs"; STATE="$EXTAS_ROOT/state"; short="${SHA:0:12}"
install -d -m 0755 "$D"; mkdir -p "$STATE"

if ! grep -qx "commit=$SHA" "$D/$short/COMMIT" 2>/dev/null; then
  new="$(mktemp -d "$D/.incoming-$short.XXXXXX")"
  link=(); [ -d "$D/current/docs" ] && link=(--link-dest="$(readlink -f "$D/current")")
  # --checksum: a file is linked to the previous copy only when its content is the same (not size and time alone)
  rsync -a --checksum --no-owner --no-group --chmod=D0755,F0644 "${link[@]}" "$SRC/README.md" "$SRC/docs" "$new/"
  # (run as root on the runner's checkout: safe.directory, or git refuses to read it)
  committed="$(git -c safe.directory="$SRC" -C "$SRC" log -1 --format=%cI "$SHA" 2>/dev/null || true)"
  {
    echo "commit=$SHA"
    [ -n "$committed" ] && echo "committed=$(TZ="$EXTAS_TIMEZONE" date -d "$committed" '+%Y-%m-%d %H:%M')"
    echo "copied=$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"
    echo "timezone=$EXTAS_TIMEZONE"
  } > "$new/COMMIT"
  # PR 390 (B7.5): the Site manual as one Markdown file beside the blueprint (docs/MANUAL.md), made from the page guides
  # of this commit; a checkout without guides gets none, and a failure here never stops the deploy.
  mrc=0
  bash "$HERE/manual-md.sh" "$SRC" "$new/docs/MANUAL.md" "$SHA" "$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')" || mrc=$?
  [ "$mrc" -eq 0 ] || [ "$mrc" -eq 3 ] || echo "docs-sync: the manual copy was not made (exit $mrc)" >&2
  chmod 0755 "$new"; chmod 0644 "$new/COMMIT"
  rm -rf "${D:?}/$short"
  mv "$new" "$D/$short"
fi
# current → this copy, atomically; its time marks it as the newest for the retention below
touch "$D/$short"
ln -sfn "$short" "$D/.current.new"
mv -Tf "$D/.current.new" "$D/current"

# Retention: the newest DOCS_KEEP_VERSIONS copies (the one current points at always stays) and no half copies.
find "$D" -mindepth 1 -maxdepth 1 -name '.incoming-*' ! -newer "$D/$short" -exec rm -rf {} +
kept=0
while read -r dir; do
  kept=$((kept + 1))
  if [ "$kept" -gt "$DOCS_KEEP_VERSIONS" ] && [ "$dir" != "$short" ]; then rm -rf "${D:?}/$dir"; kept=$((kept - 1)); fi
done < <(find "$D" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9a-f]{12}' -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2)

files="$(find "$D/$short" -type f | wc -l)"
jq -n --arg sha "$SHA" --arg at "$(date -Is)" --argjson files "$files" --argjson kept "$kept" \
  '{result:"ok",sha:$sha,at:$at,files:$files,kept:$kept}' > "$STATE/docs-latest.json"
echo "docs: $short on the server ($files files, $kept copies kept), $D/current"
