# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `40a179957516` |
| Time (Asia/Dhaka) | 2026-11-16 06:38 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — /admin/rules: request 403: /api/admin/rules/hub/sim (phone); /admin/rules: console error: Failed to load resource: the server responded with a status of 403 () (/api/admin/rules/hub/sim) (phone); /admin/rules: request 403: /api/admin/rules/hub/sim (desktop) |
| Docs on the server | `40a179957516` — README.md + docs/ (2614 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/admin/rules: request 403: /api/admin/rules/hub/sim (phone); /admin/rules: console error: Failed to load resource: the server responded with a status of 403 () (/api/admin/rules/hub/sim) (phone); /admin/rules: request 403: /api/admin/rules/hub/sim (desktop)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43779609866 |
