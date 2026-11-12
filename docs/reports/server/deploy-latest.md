# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `4893f4decdfb` |
| Time (Asia/Dhaka) | 2026-11-12 19:05 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 4893f4decdfb, colour green |
| Smoke test (every page) | FAILED — /reset: answered 401 with no cookie at all, expected 200 (no auth); /reset: no Clear-Site-Data "cookies" header (got "") |
| Docs on the server | `4893f4decdfb` — README.md + docs/ (2458 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/reset: answered 401 with no cookie at all, expected 200 (no auth); /reset: no Clear-Site-Data "cookies" header (got "")), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43221690645 |
