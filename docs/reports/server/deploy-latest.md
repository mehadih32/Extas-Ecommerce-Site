# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `5bf53e7b2efd` |
| Time (Asia/Dhaka) | 2026-11-27 23:39 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — check (PR 657): Products design B (Focus view): the "Ready to publish" hero draws, read-only (CN-025, CN-044): page.goto: Timeout 30000ms exceeded. |
| Docs on the server | `5bf53e7b2efd` — README.md + docs/ (2623 files) |
| Main disk (/) | 117 GB free after the clean-up (was 117 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (check (PR 657): Products design B (Focus view): the "Ready to publish" hero draws, read-only (CN-025, CN-044): page.goto: Timeout 30000ms exceeded.), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/46040780346 |
