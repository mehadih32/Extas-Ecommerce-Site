# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `311dbd60375b` |
| Time (Asia/Dhaka) | 2026-10-31 17:25 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 311dbd60375b, colour green |
| Smoke test (every page) | OK — 226 page views, signed out and as the admin, phone and desktop (pictures: `docs/reports/smoke/latest/`) |
| Docs on the server | `311dbd60375b` — README.md + docs/ (2356 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| Live colour | green |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41195081287 |
