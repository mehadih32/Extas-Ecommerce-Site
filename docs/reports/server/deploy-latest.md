# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `0f6ac8a037d2` |
| Time (Asia/Dhaka) | 2026-11-01 22:12 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 0f6ac8a037d2, colour blue |
| Smoke test (every page) | OK — 320 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `0f6ac8a037d2` — README.md + docs/ (2316 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41323926299 |
