# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `1a9564886a3b` |
| Time (Asia/Dhaka) | 2026-10-31 15:46 |
| Result | **FAILED** |
| Database migration | not reached |
| Health check on new.extas.com.bd | FAILED — https://new.extas.com.bd/api/health answered HTTP 521 (a Cloudflare error: the server did not answer Cloudflare) |
| Docs on the server | `1a9564886a3b` — README.md + docs/ (2349 files) |
| Main disk (/) | 120 GB free after the clean-up (was 120 GB), at least 15 GB needed |
| What failed | Building the new version on the server failed (the app or the migrate image did not build). The live site was not touched. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41190040351 |
