# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `b1be453ad6be` |
| Time (Asia/Dhaka) | 2026-11-01 23:21 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version b1be453ad6be, colour green |
| Smoke test (every page) | OK — 386 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `b1be453ad6be` — README.md + docs/ (2335 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| Live colour | green |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41330128047 |
