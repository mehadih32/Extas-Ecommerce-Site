# Prohori প্রহরী · A360-02 · EXTAS playbooks (curriculum wave 2, PR 579)

Load order before any server, security, deploy, backup or QA task: this README → task modules → MYTHS.md →
lessons/ALL.md + lessons/prohori.md. Imported generic skills stay in `ext/` (skills/INDEX.md); these EXTAS modules win
where they disagree.

| # | File | Topic | Level |
|---|---|---|---|
| R01 | 01-vps-hardening-azure.md | Azure NSG/JIT, SSH keys, UFW (+ Docker bypass), fail2ban, unattended upgrades | Grad → PG |
| R02 | 02-nginx-tls.md | Nginx TLS, Let's Encrypt lifetimes (45 days by 2028), headers, graceful reload; Caddy equivalence | Grad → PG |
| R03 | 03-zero-downtime-deploy.md | PM2 cluster reload, graceful shutdown, PHP symlink releases + `$realpath_root`, expand/contract migrations, rollback | PG |
| R04 | 04-backups-google-drive.md | CISA backup principles, 3-2-1 map, pg_dump, rclone crypt to Drive, restore drills, RPO/RTO | Grad → PG |
| R05 | 05-secrets-vault.md | OWASP secrets rules, master key outside DB (Key Vault / age), SOPS, rotation calendar, leak drill | PG |
| R06 | 06-owasp-ecommerce.md | OWASP Top 10:2025 mapped to EXTAS, CSRF, sessions, rate limits, payment-callback rules | PG → PhD |
| R07 | 07-bd-payment-webhooks.md | SSLCommerz IPN + validation, bKash/Nagad (what is and isn't verified), SNS signatures, decision tree | PG → PhD |
| R08 | 08-monitoring-telegram.md | golden signals, alert levels, Telegram limits, Uptime Kuma, dead-man and business monitors | PG |
| R09 | 09-incident-response.md | NIST 800-61r3 / CSF 2.0, severity, response loop, blameless postmortems, runbooks | PG → PhD |
| R10 | 10-playwright-qa.md | emulation limits, device matrix, journeys, history/scroll tests, flaky control, axe | PG |
| R11 | 11-audit-runner.md | PR 570 audit-runner design: check model, run modes, pipeline, report, auditing the auditor | PhD |
| — | MYTHS.md | 15 myths with evidence | all |
| — | **EXAM.md** | **25 items + answer key, pass 85% (22/25)** | — |

## Confidence tags
**[OFFICIAL]** vendor/standards documentation (Microsoft, Ubuntu, NGINX, Let's Encrypt, PM2, Deployer, PostgreSQL,
rclone, SOPS, OWASP, NIST, CISA, AWS, Telegram, Playwright, SSLCommerz, Google SRE book) · **[2-SRC]** two independent good
sources · **[HOUSE]** EXTAS rule (owner guardrails, blueprint, our economics — revisable by data) ·
**[COMMUNITY — test before use]** single practitioner/vendor/library claim. Only the first three are rules (PR 585 gate).

## Pages our tools could not read
developer.bka.sh (bKash official docs) · bKash webhook AsyncAPI page · Nagad official docs · redx.com.bd developer page ·
Google SRE Incident Management Guide PDF · Apple HIG · OWASP Session Management and Authentication cheat sheets. Every
claim that depended on them is tagged COMMUNITY or HOUSE, and R07 says so explicitly.

## Decisions for the owner / lead (raised by this wave)
1. **Reverse proxy:** master register PR 7 says **Caddy**; this curriculum was asked to teach **Nginx**. Keep Caddy for the shop (simplest, automatic TLS) and use Nginx only if the ERP/legacy PHP needs it — or switch PR 7 to Nginx. One choice, filed in the register.
2. **Third backup copy** that the server cannot delete (second Drive account with add-only rights, or Azure Blob with immutability) — small monthly cost; protects against ransomware deleting Drive copies.
3. **Restore targets:** confirm RPO ≤ 24 h and RTO ≤ 2 h, or ask for tighter (needs WAL/point-in-time backups, more cost).
4. **Vault master key location:** Azure Key Vault via managed identity (recommended) vs an age key file on the server.
5. **HSTS preload** — hard to undo; owner's yes/no.
6. **Payment gateway onboarding docs** — the official bKash/Nagad/SSLCommerz merchant integration guides must be obtained from the gateways (they are not fully public); R07 rules stay as they are, field details get filled in from those docs.

*As of October 2026.*
