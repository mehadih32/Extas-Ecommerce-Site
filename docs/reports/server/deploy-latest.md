# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `bee4f44ed376` |
| Time (Asia/Dhaka) | 2026-11-13 15:37 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version bee4f44ed376, colour blue |
| Smoke test (every page) | FAILED — /admin/ai/permissions: request failed: /admin (net::ERR_CONNECTION_CLOSED) (desktop); /admin/ai/permissions: console error: Failed to load resource: net::ERR_CONNECTION_CLOSED (/admin?home=1&_rsc=j7eaihOMoi9gF7ez) (desktop) |
| Docs on the server | `bee4f44ed376` — README.md + docs/ (2509 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/admin/ai/permissions: request failed: /admin (net::ERR_CONNECTION_CLOSED) (desktop); /admin/ai/permissions: console error: Failed to load resource: net::ERR_CONNECTION_CLOSED (/admin?home=1&_rsc=j7eaihOMoi9gF7ez) (desktop)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43400652530 |
