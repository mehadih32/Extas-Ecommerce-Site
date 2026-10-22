#!/usr/bin/env bash
# Run before any commit that touches docs/MASTER-REGISTER.md, docs/BLUEPRINT.md or README.md (CLAUDE.md "How to
# report"). It regenerates the stage and PR pages and then runs the same checks as CI's docs steps, so a docs push can
# never fail "Stage pages match the register" or "README status matches the register" again. Needs only Node.
#   tools/docs/precommit-docs.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
node tools/docs/gen-stage-pages.mjs
node tools/docs/gen-stage-pages.mjs --check
node tools/readme-status.mjs
node tools/readme-guard.mjs
echo "docs checks passed — commit docs/stages/ and README.md with your change"
