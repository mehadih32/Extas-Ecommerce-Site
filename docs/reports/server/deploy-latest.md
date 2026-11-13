# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `40918c8d6696` |
| Time (Asia/Dhaka) | 2026-11-14 03:20 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 40918c8d6696, colour blue |
| Smoke test (every page) | OK — 646 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `40918c8d6696` — README.md + docs/ (2548 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43507137584 |
