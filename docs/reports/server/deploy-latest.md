# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `6da626627b88` |
| Time (Asia/Dhaka) | 2026-11-15 10:20 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — /collections/new-in: request 404: /media/media/s1/r/01a1dd64-3430-7433-99ca-6b17712f0de4/practice-trouser-556B2F-front-card.e43501f1eeac.avif (desktop); /collections/new-in: console error: Failed to load resource: the server responded with a status of 404 () (/media/media/s1/r/01a1dd64-3430-7433-99c |
| Docs on the server | `6da626627b88` — README.md + docs/ (2597 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/collections/new-in: request 404: /media/media/s1/r/01a1dd64-3430-7433-99ca-6b17712f0de4/practice-trouser-556B2F-front-card.e43501f1eeac.avif (desktop); /collections/new-in: console error: Failed to load resource: the server responded with a status of 404 () (/media/media/s1/r/01a1dd64-3430-7433-99c), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43674955347 |
