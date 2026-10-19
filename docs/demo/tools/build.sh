#!/bin/bash
# usage: tools/build.sh [output.html]   (run from the proto folder)
set -e
OUT=${1:-dist/EXTAS-demo.html}
cd "$(dirname "$0")/.."
if command -v python3 >/dev/null 2>&1; then python3 tools/make-register.py --quiet || echo "warning: PR register data not refreshed (tools/make-register.py failed)" >&2; else echo "warning: python3 missing — PR register data not refreshed" >&2; fi   # PR 594 (Prohori)
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  echo '<title>EXTAS · Demo store</title>'
  # R15 wave 1 (bug 21): a basic meta description. Canonical, Open Graph, JSON-LD and real URLs belong to the real (server) build.
  echo '<meta name="description" content="EXTAS — menswear made in Bangladesh: polos, T-shirts, shirts, panjabi, trousers and hoodies. Cash on delivery all over Bangladesh, size exchange.">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Archivo:wght@500;600;700;800&family=Hind+Siliguri:wght@400;500;600&family=Cormorant+Garamond:wght@500;600;700&display=swap">'
  echo '<style>'; cat src/styles.css
  for c in src/r11-*.css src/r12-*.css; do [ -e "$c" ] && { echo "/* ---- $(basename $c) ---- */"; cat "$c"; }; done
  echo '</style></head><body><div id="app"></div><script>'
  for f in $(ls src/*.js | sort); do echo "/* ---- $(basename $f) ---- */"; cat "$f"; echo; done
  echo '</script></body></html>'
} > "$OUT"
echo "built $OUT ($(wc -c < "$OUT") bytes)"
