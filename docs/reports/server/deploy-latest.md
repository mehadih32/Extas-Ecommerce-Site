# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `5bf53e7b2efd` |
| Time (Asia/Dhaka) | 2026-11-27 23:56 |
| Result | **OK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | OK — 708 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `5bf53e7b2efd` — README.md + docs/ (2623 files) |
| Main disk (/) | 117 GB free after the clean-up (was 117 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/46040780346 |
