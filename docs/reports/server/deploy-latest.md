# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `97c648bfa222` |
| Time (Asia/Dhaka) | 2026-11-12 19:53 |
| Result | **FAILED** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health |
| Docs on the server | `97c648bfa222` — README.md + docs/ (2457 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The deploy stopped: new version did not become healthy; live version unchanged. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43231590601 |
