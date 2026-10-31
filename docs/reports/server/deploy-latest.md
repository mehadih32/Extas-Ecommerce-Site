# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `19d12457c1cd` |
| Time (Asia/Dhaka) | 2026-10-31 12:56 |
| Result | **OK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 19d12457c1cd, colour green |
| Smoke test (every page) | OK — 220 page views, signed out and as the admin, phone and desktop (pictures: `docs/reports/smoke/latest/`) |
| Docs on the server | `19d12457c1cd` — README.md + docs/ (2342 files) |
| Main disk (/) | 111 GB free after the clean-up (was 110 GB), at least 15 GB needed |
| Live colour | green |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41176853718 |
