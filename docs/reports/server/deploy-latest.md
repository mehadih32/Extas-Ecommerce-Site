# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `c8af4543b3f1` |
| Time (Asia/Dhaka) | 2026-11-14 19:49 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — /status: request 404: /status (phone); /status: console error: Failed to load resource: the server responded with a status of 404 () (/status) (phone); /status: request 404: /status (desktop) |
| Docs on the server | `c8af4543b3f1` — README.md + docs/ (2553 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/status: request 404: /status (phone); /status: console error: Failed to load resource: the server responded with a status of 404 () (/status) (phone); /status: request 404: /status (desktop)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43600170417 |
