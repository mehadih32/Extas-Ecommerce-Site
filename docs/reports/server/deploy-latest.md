# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `7b474d84f1e6` |
| Time (Asia/Dhaka) | 2026-11-15 18:45 |
| Result | **OK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | OK — 676 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `7b474d84f1e6` — README.md + docs/ (2600 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43713985985 |
