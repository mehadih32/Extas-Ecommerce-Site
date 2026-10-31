#!/usr/bin/env bash
# R1 ops review (M2, PR 4) — is the commit this deploy run would build already older than the live one?
#   deploy-order.sh <commit to deploy> <live commit>   → prints skip=true|false (for $GITHUB_OUTPUT) and one line why
# ci runs per push in parallel (ci.yml), so commit A's ci can finish after commit B's: without this, A was deployed over
# B and staging ran an older version than main. GitHub compares the two (GET compare/<live>...<commit>; GH_TOKEN and
# API from the workflow): "behind" means the commit is an ancestor of the live one, and its deploy is skipped (a green
# run). Anything else deploys as before: the same commit again, a newer one, a diverged one, no live version yet, or no
# answer from GitHub (a deploy is never lost to an API hiccup).
set -euo pipefail
sha="${1:?usage: deploy-order.sh <commit> <live commit>}"; live="${2:-}"
say() { echo "skip=$1"; echo "$2" >&2; }
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { say false "not a full commit ($sha): deploying"; exit 0; }
[[ $live =~ ^[0-9a-f]{40}$ ]] || { say false "no live version recorded: deploying"; exit 0; }
[ "$sha" != "$live" ] || { say false "the live version again: deploying"; exit 0; }
status="$(curl -fsS -m 20 -H "Authorization: Bearer ${GH_TOKEN:-}" -H "Accept: application/vnd.github+json" \
  "${API:?API: the repository API address}/compare/$live...$sha" 2>/dev/null | jq -r '.status // empty' 2>/dev/null || true)"
case "$status" in
  behind) say true "commit ${sha::12} is older than the live ${live::12} (a newer commit's ci finished first): not deployed" ;;
  "") say false "GitHub did not compare ${sha::12} with the live ${live::12}: deploying" ;;
  *) say false "commit ${sha::12} is $status of the live ${live::12}: deploying" ;;
esac
