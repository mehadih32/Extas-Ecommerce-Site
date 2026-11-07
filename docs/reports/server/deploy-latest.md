# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `31c029996b47` |
| Time (Asia/Dhaka) | 2026-11-07 11:41 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 31c029996b47, colour blue |
| Smoke test (every page) | FAILED — /admin/products: console error: Access to script at 'https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092' from origin 'https://new.extas.com.bd' has been blocked by CORS policy: Request (/admin/login?next=%2Fadmin%2Fproducts) (phone); /admin/products: r |
| Docs on the server | `31c029996b47` — README.md + docs/ (2417 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/admin/products: console error: Access to script at 'https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092' from origin 'https://new.extas.com.bd' has been blocked by CORS policy: Request (/admin/login?next=%2Fadmin%2Fproducts) (phone); /admin/products: r), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/42342673675 |
