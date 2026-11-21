# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `d796a8c0a3f5` |
| Time (Asia/Dhaka) | 2026-11-21 19:05 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on extas.com.bd | OK — HTTP 200 from https://extas.com.bd/api/health |
| Smoke test (every page) | FAILED — /admin/customers/segments/new: request 403: /api/admin/customers/segments/preview (phone); /admin/customers/segments/new: console error: Failed to load resource: the server responded with a status of 403 () (/api/admin/customers/segments/preview) (phone); /admin/customers/segments/new: request 403:  |
| Docs on the server | `d796a8c0a3f5` — README.md + docs/ (2621 files) |
| Main disk (/) | 117 GB free after the clean-up (was 117 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/admin/customers/segments/new: request 403: /api/admin/customers/segments/preview (phone); /admin/customers/segments/new: console error: Failed to load resource: the server responded with a status of 403 () (/api/admin/customers/segments/preview) (phone); /admin/customers/segments/new: request 403: ), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/44905296807 |
