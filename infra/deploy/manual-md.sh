#!/usr/bin/env bash
# S18 · PR 390 (Blueprint B7.5) — the Site manual as one Markdown file, kept with the blueprint documents.
#   infra/deploy/manual-md.sh <checkout dir> <out file> [<commit sha>] [<date text>]
# Builds the same book the admin's Site manual shows (PR 387): a chapter per admin section in the sidebar's order
# (ADMIN_SECTIONS in packages/settings/src/registry-admin-shell.ts), each the section overview
# (docs/admin-guide/pages/<section>/index.md) and then the section's page guides in the order of
# apps/web/src/lib/admin-shell/help-pages.json. Headings move down under the chapter, links to other guide files become
# plain text (they point nowhere in one file), writers' notes (<!-- -->) are dropped.
# docs-sync.sh runs it on every deploy into the server's copy of docs/ (docs/MANUAL.md, beside BLUEPRINT.md and
# MASTER-REGISTER.md), so every backup's docs bundle carries it and the admin offers it as a download.
# Exit 0 = written; 3 = nothing to build (no guides or table in the checkout, nothing written). Needs bash, sed, jq.
set -euo pipefail
SRC="${1:?usage: manual-md.sh <checkout dir> <out file> [<commit sha>] [<date text>]}"
OUT="${2:?usage: manual-md.sh <checkout dir> <out file> [<commit sha>] [<date text>]}"
SHA="${3:-}"
WHEN="${4:-}"
TABLE="$SRC/apps/web/src/lib/admin-shell/help-pages.json"
PAGES="$SRC/docs/admin-guide/pages"
REG="$SRC/packages/settings/src/registry-admin-shell.ts"
[ -f "$TABLE" ] && [ -d "$PAGES" ] && [ -f "$REG" ] || exit 3

# One guide file under a chapter: every heading <prefix> lower ("#" one level, "##" two), links to other guide files as
# plain text, writers' notes out.
body() {
  sed -E \
    -e '/<!--.*-->/d' \
    -e '/<!--/,/-->/d' \
    -e "s/^(#{1,4}) /$2\\1 /" \
    -e 's/\[([^]]+)\]\([^)#]*\.md(#[^)]*)?\)/\1/g' "$1"
}

# A chapter's name: the overview's first "# " line without its " — সেকশনের সারকথা" ending.
title_of() { sed -n 's/^# //p' "$1" | head -n 1 | sed -E 's/ — [^—]*$//'; }

mapfile -t sections < <(sed -n '/ADMIN_SECTIONS = \[/,/\]/p' "$REG" | grep -oE "'[a-z]+'" | tr -d "'")
[ "${#sections[@]}" -gt 0 ] || exit 3

tmp="$(mktemp "$(dirname "$OUT")/.manual.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
{
  echo "# Site manual · সাইট ম্যানুয়াল"
  echo
  echo "প্রতিটা অ্যাডমিন সেকশন একটা অধ্যায়, প্রতিটা পাতা তার ছয় ভাগে: এটা কী · কেন দরকার · কীভাবে করবেন · প্রতিটা বোতাম আর ঘরের মানে · সাধারণ ভুল · এরপর কী হয়।"
  echo "The same text as the admin's Help › Site manual, made from docs/admin-guide/pages/ on every deploy."
  if [ -n "$SHA" ]; then echo "Commit \`${SHA:0:12}\`${WHEN:+ · $WHEN}."; fi
  echo
  echo "## সূচি · Contents"
  echo
  n=0
  for s in "${sections[@]}"; do
    [ -f "$PAGES/$s/index.md" ] || continue
    n=$((n + 1))
    echo "$n. $(title_of "$PAGES/$s/index.md")"
  done
  n=0
  for s in "${sections[@]}"; do
    [ -f "$PAGES/$s/index.md" ] || continue
    n=$((n + 1))
    printf '\n---\n\n## %s. %s\n' "$n" "$(title_of "$PAGES/$s/index.md")"
    # the overview without its own title (the chapter heading above says it)
    body "$PAGES/$s/index.md" "#" | sed '0,/^## /{/^## /d}'
    while read -r id; do
      [ -f "$PAGES/$id.md" ] || continue
      echo
      body "$PAGES/$id.md" "##"
    done < <(jq -r --arg s "$s" '.pages[] | select(.id | startswith($s + "/")) | .id' "$TABLE")
  done
} > "$tmp"
chmod 0644 "$tmp"
mv -f "$tmp" "$OUT"
trap - EXIT
