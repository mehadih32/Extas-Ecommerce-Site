# Deploy report — the last rollback

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `419e6d86338a` |
| Time (Asia/Dhaka) | 2026-11-06 06:34 |
| Result | **OK** |
| Database migration | skipped (rollback: the database stays as it is) |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 419e6d86338a, colour blue |
| Docs on the server | copied, but its record is missing |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| Live colour | blue |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/42137694308 |
