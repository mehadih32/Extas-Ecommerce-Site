# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `98d378e6b4a0` |
| Time (Asia/Dhaka) | 2026-11-01 11:02 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 98d378e6b4a0, colour green |
| Smoke test (every page) | OK — 310 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `98d378e6b4a0` — README.md + docs/ (2284 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| Live colour | green |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41274845245 |
