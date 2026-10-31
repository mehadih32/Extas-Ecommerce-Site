# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `42b8f00d33e0` |
| Time (Asia/Dhaka) | 2026-10-31 15:08 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 42b8f00d33e0, colour blue |
| Smoke test (every page) | FAILED — problem: the append-only check could not read the database (postgres:17 running since 2026-10-31T07:30:36.575859967Z; PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin; sh: 1: tr: not found exec PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/ |
| Docs on the server | `42b8f00d33e0` — README.md + docs/ (2348 files) |
| Main disk (/) | 119 GB free after the clean-up (was 119 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (problem: the append-only check could not read the database (postgres:17 running since 2026-10-31T07:30:36.575859967Z; PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin; sh: 1: tr: not found exec PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/41186952076 |
