# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `1431f241b114` |
| Time (Asia/Dhaka) | 2026-11-16 23:55 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — /admin/settings/couriers: answered 500 (phone); /admin/settings/couriers: request 500: /admin/settings/couriers (phone); /admin/settings/couriers: console error: Failed to load resource: the server responded with a status of 500 () (/admin/settings/couriers) (phone) |
| Docs on the server | `1431f241b114` — README.md + docs/ (2618 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/admin/settings/couriers: answered 500 (phone); /admin/settings/couriers: request 500: /admin/settings/couriers (phone); /admin/settings/couriers: console error: Failed to load resource: the server responded with a status of 500 () (/admin/settings/couriers) (phone)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43919660500 |
