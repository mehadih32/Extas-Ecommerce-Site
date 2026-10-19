# R05 · Secrets in an encrypted vault

*Prohori প্রহরী · A360-02 · module 5 of 11 · level: Post-graduate · version 1.0 · as of October 2026*

EXTAS rule already filed: **PR 493 credential vault** — every key encrypted at rest, entered from the admin, never in
the repository or Git; **PR 494** CI fails on a hardcoded key/number/policy string.

---

## 1. Principles [OFFICIAL — OWASP Secrets Management Cheat Sheet]

1. **Centralise** secrets management — and protect the vault's own master secret in a **separate** system.
2. **Least privilege:** nobody and nothing can read every secret; fine-grained access per secret.
3. **Rotate** regularly (automate where possible); user passwords rotate on suspicion of compromise.
4. **Limit human handling;** prefer short-lived dynamic credentials.
5. **Audit log** every read, change and admin action; tamper-resistant, accurate timestamps.
6. **CI/CD is production:** least privilege, no shared "big secret", short-lived credentials that expire after the job.
7. **Detect secrets before commit** (IDE / pre-commit hook; consider two scanners).
8. **On a leak — in this order:** revoke → rotate → delete from code/logs/exposed systems → record the lifecycle for responders. Restarting the app does **not** revoke a stolen key.
9. **Avoid environment variables** where possible — readable by other processes, can end up in logs/dumps; never bake secrets into Docker `ENV`/`ARG`.

## 2. EXTAS design [HOUSE, built on OWASP + Microsoft + SOPS docs]

```
Admin form (owner pastes bKash/Nagad/SSLCommerz/courier/SMS/WhatsApp/Meta keys)
   → app encrypts with a data key (AES-GCM) → PostgreSQL "secrets" table (ciphertext only)
   → data key itself encrypted by the MASTER KEY
MASTER KEY lives outside the database:
   option A: Azure Key Vault, read by the VM's managed identity (no credential in code) [OFFICIAL basis — Microsoft Learn]
   option B: an age key file on the server (root-only, 0400), backed up sealed with the owner
```
- The app decrypts a secret **at the moment of use**, keeps it in memory only, never logs it (log redaction filter for `key|secret|token|password|authorization`).
- **Per-secret permissions:** payment keys readable only by the payment service; courier keys by the courier adapter; agents never see raw keys (they call tools).
- **Audit:** every decrypt writes `who/what/when/why` (service name, not value) → weekly summary to Prohori.
- **Masking in admin:** show last 4 characters; "replace" not "view".

### Files at rest outside the app (compose `.env`, rclone config, server bootstrap): **SOPS + age** [OFFICIAL — SOPS docs]
- SOPS encrypts **values, not keys** in YAML/JSON/ENV/INI (diffs stay readable); each value gets its own IV; a MAC detects added/removed values.
- Backends: **age (recommended over PGP)**, PGP, AWS/GCP KMS, **Azure Key Vault**, HashiCorp Vault; key groups with Shamir threshold.
- `.sops.yaml` creation rules: first match wins.
- Use **`sops exec-env`** to inject secrets into a process **without writing plaintext to disk**.
- Rotation: `sops rotate` (new data key); after a key compromise: `updatekeys` to remove it, then `rotate`, then rotate the underlying secrets.

## 3. Rotation calendar [HOUSE — owner approves anything touching payments]
| Secret | Rotate | Trigger |
|---|---|---|
| Payment gateway keys (bKash, Nagad, SSLCommerz) | yearly or per gateway rule | staff change, leak, gateway request |
| Courier API keys | yearly | staff change, leak |
| SMS / WhatsApp / Meta tokens | when the platform expires them; check monthly | — |
| DB passwords, Redis | 6 months | leak |
| SSH keys | person leaves → same day | — |
| Vault master key | yearly (re-wrap data keys) | suspected server compromise |

## 4. Leak drill (do it once on staging so it's muscle memory)
1. Simulate: a courier key pushed to a branch.
2. Pre-commit/CI scanner catches it (PR 494) — if not, that's the first finding.
3. Revoke at the courier portal → new key into the vault → confirm adapter works → purge from Git history and logs.
4. Telegram: "🔐 key rotated: courier-steadfast, reason: drill".
5. Write the timings into the incident log.

## 5. Checklist
- [ ] No secret in repo, image, logs, error pages, front-end bundle (search the built JS for key patterns)
- [ ] Master key outside the DB; DB stolen alone = useless ciphertext
- [ ] Per-service access; agents never handle raw secrets
- [ ] Audit log on; weekly review
- [ ] SOPS/age for server files; plaintext `.env` absent from disk
- [ ] Rotation calendar in the admin with due dates; overdue = Telegram reminder
- [ ] Leak drill done this year

---

**Sources** (type in brackets):
- [Official — OWASP] Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- [Official — SOPS docs] SOPS documentation (print view): https://getsops.io/_print/docs/
- [Official — Microsoft Learn] Azure VM security (managed identities, Key Vault): https://learn.microsoft.com/azure/virtual-machines/security-policy
- [Internal] master register PR 493, PR 494

*As of October 2026.*
