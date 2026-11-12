# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `97c648bfa222` |
| Time (Asia/Dhaka) | 2026-11-12 19:36 |
| Result | **FAILED, ROLLBACK FAILED** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 97c648bfa222, colour green |
| Smoke test (every page) | FAILED — the smoke test did not finish (exit 1) |
| Docs on the server | `97c648bfa222` — README.md + docs/ (2457 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The smoke test found a problem (the smoke test did not finish (exit 1)) and putting the previous version back failed too (see the run log). |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43227644499 |
