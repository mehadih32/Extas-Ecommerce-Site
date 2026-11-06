# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `09b0afdba8ae` |
| Time (Asia/Dhaka) | 2026-11-07 00:56 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version 09b0afdba8ae, colour green |
| Smoke test (every page) | FAILED — check (PR 633): Orders › Returns › QC draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; check (PR 633): Orders › Returns › Hand-back draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; |
| Docs on the server | `09b0afdba8ae` — README.md + docs/ (2415 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (check (PR 633): Orders › Returns › QC draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; check (PR 633): Orders › Returns › Hand-back draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.;), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/42273094011 |
