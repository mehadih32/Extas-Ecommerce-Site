# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `f1266bbd545b` |
| Time (Asia/Dhaka) | 2026-10-31 14:27 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version f1266bbd545b, colour blue |
| Smoke test (every page) | FAILED — problem: the append-only check could not read the database |
| Docs on the server | `f1266bbd545b` — README.md + docs/ (2344 files) |
| Main disk (/) | 119 GB free after the clean-up (was 119 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (problem: the append-only check could not read the database), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41184211181 |
