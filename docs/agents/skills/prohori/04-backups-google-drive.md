# R04 · Backups to Google Drive — 3-2-1, encryption, restore drills

*Prohori প্রহরী · A360-02 · module 4 of 11 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

Owner decision already made: backups go to **Google Drive** (PR 8, PR 395/507). This module makes that safe.

---

## 1. Principles

- **CISA: keep offline, encrypted backups of critical data and regularly test their availability and integrity in a disaster-recovery scenario**; backups must be offline because ransomware hunts for reachable backups to delete or encrypt; keep "golden images" to rebuild systems fast; keep logs ≥ 1 year if possible **[OFFICIAL — CISA #StopRansomware guide]**.
- **3-2-1:** 3 copies, 2 different media/locations, 1 off-site **[HOUSE framing — widely used rule; the CISA principles above are the official basis]**.

### EXTAS 3-2-1 map [HOUSE]
| Copy | Where | Notes |
|---|---|---|
| 1 | live PostgreSQL + uploads on the Azure VM | production |
| 2 | **encrypted** nightly archive on Google Drive (owner's Workspace, dedicated folder) | off-site, different provider |
| 3 | weekly encrypted archive to a second destination **with no delete rights from the server** (e.g. a second Drive account the server can only add to, or Azure Blob with immutability) | protects against a compromised server deleting Drive copies — **owner decision** |

## 2. What is backed up [HOUSE]
- PostgreSQL: `pg_dump -Fc` per database — consistent while the DB is in use and **doesn't block readers or writers**; custom format is compressed and restored with `pg_restore`, which can restore selected items; `pg_dumpall --globals-only` for roles **[OFFICIAL — PostgreSQL manual]**.
- Uploads (product photos, invoices PDFs) — incremental.
- Config: proxy config, compose files, crontabs, **encrypted** vault export (R05) — never plaintext secrets.
- The agent skill library and lessons (PROTOCOL: included in the nightly backup).
- Warning from the manual: restoring a dump can run code chosen by the source's superusers — only restore dumps we made **[OFFICIAL]**.

## 3. Tooling — rclone + crypt [OFFICIAL — rclone docs]

- A **crypt** remote wraps the Drive remote: files are encrypted before upload (NaCl SecretBox — XSalsa20 + Poly1305, 64 KiB chunks, key from your password via scrypt; optional second password as salt). **File length and modification time are not hidden.**
- Filename encryption: *standard* (recommended), *obfuscate* (weak), *off*.
- **Lose the password → data is unrecoverable**; you can't change it for existing data.
- Verify with **`rclone cryptcheck`** (plain `rclone check` can't compare crypt hashes).
- `rclone.conf` passwords are only **obscured**, not secured → enable rclone config encryption, password from the vault.

```
pg_dump -Fc extas > /backup/extas_$(date +%F).dump
rclone copy /backup  extas-crypt:db/$(date +%F)/    # extas-crypt = crypt over gdrive:EXTAS-Backups
rclone cryptcheck /backup extas-crypt:db/$(date +%F)/
```
- Google Drive daily upload quotas exist (a **750 GiB/day** figure is widely quoted) **[COMMUNITY — not confirmed in an official page this session]**; EXTAS volumes are far below it, but photo re-uploads after a migration could hit it — schedule big syncs over several nights.

**Where the crypt passwords live [HOUSE]:** in the vault (R05) **and** printed/sealed with the owner (two people can restore; the server alone can't be the only holder).

## 4. Schedule and retention [HOUSE — owner-editable in #/admin/backup]
- DB: nightly 02:30 BDT (before unattended-upgrade reboot window 03:30); keep 14 daily, 8 weekly, 12 monthly.
- Uploads: nightly incremental; monthly full.
- Every run → Telegram: size, duration, cryptcheck result; **a missing run is an alert** (dead-man check, R08).

## 5. Restore drills — a backup that was never restored is a hope, not a backup

Monthly (and after any backup change):
1. Spin up a **staging** DB (never restore over production in a drill).
2. Download last night's archive through crypt; `pg_restore` into staging.
3. Run integrity checks: row counts of orders/products/customers vs production at backup time; latest order timestamp; sample 5 orders end-to-end (items, totals, courier IDs).
4. Boot the app against the restored DB; smoke test (R10).
5. Record **RPO achieved** (data age) and **RTO achieved** (minutes to working staging) in the backup page.
6. Telegram summary; failures → incident (R09).

Targets [HOUSE — owner to confirm]: RPO ≤ 24 h (nightly), RTO ≤ 2 h for "site back with yesterday's data".

## 6. Restoring production (real event) — typed confirmation, staging first (PR 396/507)
Owner approval required (irreversible) → restore to staging → verify → schedule maintenance page → restore prod → replay any orders taken since the backup from courier/payment records → postmortem.

## 7. Checklist
- [ ] Nightly DB + uploads + config to Drive via crypt; cryptcheck passes
- [ ] Third copy with no delete rights from the server (decision pending)
- [ ] Crypt passwords in vault + sealed offline with the owner
- [ ] Retention applied; old archives pruned by policy, not by hand
- [ ] Monthly restore drill done; RPO/RTO recorded
- [ ] Missed backup = Telegram alert within 1 h

---

**Sources** (type in brackets):
- [Official — CISA] #StopRansomware Guide (backups, testing, golden images): https://www.cisa.gov/stopransomware/ransomware-guide
- [Official — PostgreSQL manual] pg_dump (PostgreSQL 17 man page): https://manpages.opensuse.org/Tumbleweed/postgresql17/pg_dump.1pg17.en.html
- [Official — rclone docs] Crypt: https://tip.rclone.org/crypt/
- [Third-party guide] fast.io, rclone + Google Drive quotas (750 GiB mention, no source given): https://fast.io/resources/rclone-google-drive/
- [Internal] master register PR 8, 395/396/507; AGENT-PROTOCOL.md (library in nightly backup); worklog (admin backup page)

*As of October 2026.*
