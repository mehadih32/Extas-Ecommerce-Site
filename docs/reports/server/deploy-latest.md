# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `bae28b342a78` |
| Time (Asia/Dhaka) | 2026-11-12 23:11 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version bae28b342a78, colour blue |
| Smoke test (every page) | FAILED — /admin/marketing/campaigns: answered 500 (desktop); /admin/marketing/campaigns: request 500: /admin/marketing/campaigns (desktop); /admin/marketing/campaigns: console error: Failed to load resource: the server responded with a status of 500 () (/admin/marketing/campaigns) (desktop) |
| Docs on the server | `bae28b342a78` — README.md + docs/ (2460 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (/admin/marketing/campaigns: answered 500 (desktop); /admin/marketing/campaigns: request 500: /admin/marketing/campaigns (desktop); /admin/marketing/campaigns: console error: Failed to load resource: the server responded with a status of 500 () (/admin/marketing/campaigns) (desktop)), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43264051644 |
