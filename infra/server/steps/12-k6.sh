# shellcheck shell=bash
# PR 10 — k6 baseline against the trivial page through Caddy, so every later change can be measured against it.
step_k6() {
  local out="$EXTAS_STATE_DIR/k6-baseline.json" js="$EXTAS_ROOT/stack/k6-baseline.js"
  if [ -f "$out" ] && [ "${K6_FORCE:-no}" != yes ]; then
    report INFO "PR 10 · k6 baseline" "kept from $(jq -r .at "$out"): p95 $(jq -r .p95_ms "$out") ms at $(jq -r .rps "$out") req/s"
    return 0
  fi
  cat > "$js" <<'JS'
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: Number(__ENV.VUS), duration: __ENV.DURATION, summaryTrendStats: ['avg', 'p(95)', 'p(99)', 'max'] };
export default function () { check(http.get('http://extas-caddy:8080/'), { '200': (r) => r.status === 200 }); }
JS
  docker run --rm -u 0 --network extas -e VUS="$K6_VUS" -e DURATION="$K6_DURATION" -v "$js:/s.js:ro" \
    -v "$EXTAS_ROOT/state:/out" "$IMG_K6" run --quiet --summary-export /out/k6-summary.json /s.js >/dev/null 2>&1 || true
  if [ -f "$EXTAS_STATE_DIR/k6-summary.json" ]; then
    jq --arg at "$(date -Is)" --arg vus "$K6_VUS" --arg d "$K6_DURATION" '{at:$at, vus:($vus|tonumber), duration:$d,
      p95_ms:(.metrics.http_req_duration["p(95)"]|.*100|round/100), rps:(.metrics.http_reqs.rate|round),
      failed_pct:(.metrics.http_req_failed.value*100)}' "$EXTAS_STATE_DIR/k6-summary.json" > "$out"
    report OK "PR 10 · k6 baseline" "$K6_VUS users × $K6_DURATION: p95 $(jq -r .p95_ms "$out") ms, $(jq -r .rps "$out") req/s, failed $(jq -r .failed_pct "$out")%"
  else
    report WARN "PR 10 · k6 baseline" "k6 did not produce a summary"
  fi
}
