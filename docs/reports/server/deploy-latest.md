# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `83e2defd79d0` |
| Time (Asia/Dhaka) | 2026-10-31 19:14 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 83e2defd79d0, colour blue |
| Smoke test (every page) | OK — 240 page views, signed out and as the admin, phone and desktop (pictures: `docs/reports/smoke/latest/`) |
| Docs on the server | `83e2defd79d0` — README.md + docs/ (2369 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41204005134 |
