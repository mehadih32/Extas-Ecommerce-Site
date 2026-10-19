#!/bin/bash
# L29 timing audit — rerun every round. One browser at a time, foreground.
#   bash tools/run-all.sh [build.html]
# Build first (from proto/):  bash tools/build.sh <this folder>/timing.html
cd "$(dirname "$0")/.."
export NODE_PATH=${NODE_PATH:-/opt/npm-tools/node_modules}
B=${1:-timing.html}
for s in sliders hover overlays misc extra drag; do   # drag: added in TA-2 (T3)
  echo "=== $s ==="; node tools/$s.js "$B" > out/$s.log 2>&1; tail -1 out/$s.log
done
node tools/table.js; node tools/items.js
