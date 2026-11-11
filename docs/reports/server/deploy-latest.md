# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `9cb88432c0ae` |
| Time (Asia/Dhaka) | 2026-11-11 16:21 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 9cb88432c0ae, colour blue |
| Smoke test (every page) | OK — 548 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `9cb88432c0ae` — README.md + docs/ (2447 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43000332123 |
