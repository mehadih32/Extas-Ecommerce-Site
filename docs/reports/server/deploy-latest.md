# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `d1be8551b448` |
| Time (Asia/Dhaka) | 2026-11-06 15:04 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version d1be8551b448, colour blue |
| Smoke test (every page) | FAILED — the smoke test did not finish (exit 124) |
| Docs on the server | `d1be8551b448` — README.md + docs/ (2371 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (the smoke test did not finish (exit 124)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/42189928832 |
