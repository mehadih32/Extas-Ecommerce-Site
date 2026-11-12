# Deploy report — the last deploy

Written by `deploy.yml` after every deploy (`infra/deploy/deploy-report.sh`). History: `deploy-history.md`.

| | |
|---|---|
| Commit | `de583f5687e9` |
| Time (Asia/Dhaka) | 2026-11-12 22:21 |
| Result | **FAILED, ROLLED BACK** |
| Database migration | ok |
| Health check on new.extas.com.bd | OK — HTTP 200 from https://new.extas.com.bd/api/health, version de583f5687e9, colour blue |
| Smoke test (every page) | FAILED — check (PR 643): Money › Books (the ERP account) draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; check (PR 643): Money › Daily books draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; ch |
| Docs on the server | `de583f5687e9` — README.md + docs/ (2460 files) |
| Main disk (/) | 118 GB free after the clean-up (was 118 GB), at least 15 GB needed |
| What failed | The new version went live, but the smoke test found a problem (check (PR 643): Money › Books (the ERP account) draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; check (PR 643): Money › Daily books draws in the Lumen look and follows dark mode (CN-036): page.waitForSelector: Timeout 15000ms exceeded.; ch), so the previous version was put back automatically. The fix comes before any new work. |
| Run log | https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43255072059 |
