# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `932528a4c0a8` |
| Time (Asia/Dhaka) | 2026-11-15 12:09 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — /: request 404: /media/media/s1/r/01a1dd66-0186-7e12-bb74-6ea0d978e6bc/practice-polo-F5F5F5-front-card.40afa9be2b3c.avif (phone); /: console error: Failed to load resource: the server responded with a status of 404 () (/media/media/s1/r/01a1dd66-0186-7e12-bb74-6ea0d978e6bc/practice-polo-F5F5F5-front |
| Docs on the server | `932528a4c0a8` — README.md + docs/ (2600 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/: request 404: /media/media/s1/r/01a1dd66-0186-7e12-bb74-6ea0d978e6bc/practice-polo-F5F5F5-front-card.40afa9be2b3c.avif (phone); /: console error: Failed to load resource: the server responded with a status of 404 () (/media/media/s1/r/01a1dd66-0186-7e12-bb74-6ea0d978e6bc/practice-polo-F5F5F5-front), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43682794673 |
