# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `7301dfe4b22c` |
| Time (Asia/Dhaka) | 2026-10-31 16:28 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 7301dfe4b22c, colour blue |
| Smoke test (every page) | OK — 224 page views, signed out and as the admin, phone and desktop (pictures: `docs/reports/smoke/latest/`) |
| Docs on the server | `7301dfe4b22c` — README.md + docs/ (2351 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41192427806 |
