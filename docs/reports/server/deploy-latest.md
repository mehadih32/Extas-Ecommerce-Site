# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `92e30bf1d8b9` |
| Time (Asia/Dhaka) | 2026-11-12 14:51 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 92e30bf1d8b9, colour green |
| Smoke test (every page) | FAILED — signed out, /admin/products did not go to the sign-in page (/admin/products); /admin/products: request 401: /admin/products (phone); /admin/products: console error: Failed to load resource: the server responded with a status of 401 () (/admin/products) (phone) |
| Docs on the server | `92e30bf1d8b9` — README.md + docs/ (2455 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (signed out, /admin/products did not go to the sign-in page (/admin/products); /admin/products: request 401: /admin/products (phone); /admin/products: console error: Failed to load resource: the server responded with a status of 401 () (/admin/products) (phone)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43184606281 |
