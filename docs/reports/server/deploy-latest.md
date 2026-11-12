# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `e7df4d0529b1` |
| Time (Asia/Dhaka) | 2026-11-12 17:55 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version e7df4d0529b1, colour green |
| Smoke test (every page) | FAILED — /reset: answered 401 with no cookie at all, expected 200 (no auth); /reset: no Clear-Site-Data "cookies" header (got "") |
| Docs on the server | `e7df4d0529b1` — README.md + docs/ (2455 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/reset: answered 401 with no cookie at all, expected 200 (no auth); /reset: no Clear-Site-Data "cookies" header (got "")), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43211324493 |
