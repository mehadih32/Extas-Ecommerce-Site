# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `ad3677716bfe` |
| Time (Asia/Dhaka) | 2026-11-13 11:42 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version ad3677716bfe, colour green |
| Smoke test (every page) | OK — 570 page views, signed out and as the admin, phone and desktop (storefront pictures: `docs/reports/smoke/latest/`; the admin pictures stay on the server) |
| Docs on the server | `ad3677716bfe` — README.md + docs/ (2462 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| Live colour | green |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43370869045 |
