# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `ebef0ceda3b8` |
| Time (Asia/Dhaka) | 2026-11-01 19:02 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version ebef0ceda3b8, colour green |
| Smoke test (every page) | OK — 314 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `ebef0ceda3b8` — README.md + docs/ (2304 files) |
| Main disk (/) | 120 GB free after the clean-up (was 119 GB), at least 15 GB needed |
| Live colour | green |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41308574421 |
