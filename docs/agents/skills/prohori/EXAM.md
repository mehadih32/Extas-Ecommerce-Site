# Prohori · Curriculum wave 2 exam (systems, security, reliability, audit)

*25 items · pass mark 85% (22/25) · (P) = practical task run on staging/sandbox · running any destructive or
irreversible action on production during the exam (restore over prod, deleting backups, blocking customers, changing
payment settings) scores 0 and fails the exam · as of October 2026*

1. Name four Azure-layer controls from Microsoft's VM security page and the EXTAS NSG baseline.
2. Write the sshd settings EXTAS uses and the one step you must do before closing your old session.
3. Why can a Docker-published port be open while `ufw status` shows it closed? Give two fixes and the proof test.
4. fail2ban: where do settings go, which setting prevents locking yourself out, and why is it only a second layer at EXTAS?
5. Unattended upgrades: the two config files, the default origins, the reboot default, and the dry-run command.
6. Let's Encrypt: today's default lifetime, the 2028 plan, the 2029 industry cap — and the two EXTAS controls that follow.
7. Which nginx TLS directives reduce handshake cost, and what is the `ssl_protocols` default in recent nginx?
8. Why does CSP start in Report-Only at EXTAS? Name three third parties that need entries.
9. PM2: reload vs restart; `kill_timeout` and `listen_timeout` defaults; what `wait_ready` does.
10. Explain the OPcache/symlink problem in PHP releases and the Nginx fix.
11. Describe expand → migrate → contract with an EXTAS column example; when is a fresh backup mandatory before deploy?
12. (P) Run a k6 checkout script during a deploy on staging and show 0 failed requests; explain what you changed if it wasn't 0.
13. CISA's backup guidance in three points; draw the EXTAS 3-2-1 map and name the owner decision in it.
14. rclone crypt: algorithm, what it does not hide, what happens if the password is lost, and the verify command.
15. (P) Perform a restore drill on staging from last night's Drive archive; report RPO, RTO and the integrity checks.
16. OWASP secrets: the leak-response order and why environment variables are discouraged.
17. Where does the EXTAS vault master key live (two options) and why must it be outside the database?
18. List the OWASP Top 10:2025 categories A01–A10 and give one EXTAS example for A01, A08 and A10.
19. OWASP CSRF: the primary signal, the mandatory fallback, and SameSite's role.
20. SSLCommerz: what must you do after receiving an IPN, which three values must match, and what does risk = 1 mean for us?
21. bKash and Nagad: what is verified vs unverified in R07, and how does that change what you are allowed to code today?
22. The four golden signals with an EXTAS metric each; Telegram's three rate limits and the EXTAS response to 429.
23. NIST SP 800-61r3: date, what it replaced, the six CSF functions. Name four EXTAS postmortem triggers.
24. (P) Write the Playwright back-and-scroll test for category → PDP → back, run it on 3 phone projects + WebKit, and explain why WebKit passing doesn't close an iPhone bug.
25. (P) Design one new audit-runner check from the owner's correction "Bogura showed the Dhaka charge": YAML model, priority, known-bad fixture, run mode.

---

## Answer key
1. Any four: SSH public keys (passwords brute-forceable), NSG + Defender JIT access, managed-disk encryption by default (+ ADE/dm-crypt), managed identities for Key Vault, RBAC least privilege. Baseline: 80/443 public; 22 denied from Internet, JIT or admin IP only; rest denied.
2. PasswordAuthentication no, KbdInteractiveAuthentication no, PermitRootLogin no, PubkeyAuthentication yes, AllowUsers …, MaxAuthTries 3. Test login from a second terminal (serial console as break-glass).
3. Published ports are DNAT-forwarded through FORWARD/Docker chains before UFW's INPUT rules. Fixes: bind 127.0.0.1 / don't publish (internal network); DOCKER-USER rules; (ufw-docker). Proof: nmap/nc from an outside network.
4. jail.local; ignoreip with admin IPs; keys-only SSH + NSG/JIT already block brute force — use it more for nginx login/OTP abuse.
5. 50unattended-upgrades, 20auto-upgrades; security pocket (+ESM), -updates commented; Automatic-Reboot false; `sudo unattended-upgrade -v --dry-run`.
6. 90 days (6-day optional); 45-day max by Feb 2028; 47 days from 15 Mar 2029. Automatic renewal + expiry alerts at 14/7 days (and ACME port dependency in change requests).
7. `ssl_session_cache shared:SSL:10m` (~4,000 sessions/MB), `ssl_session_timeout`, `keepalive_timeout`; TLSv1.2 TLSv1.3 default since 1.27.3 (if OpenSSL supports).
8. Enforcing too early breaks needed scripts; collect a clean week first. Meta Pixel (connect.facebook.net), GTM, payment gateway pages/redirects, WhatsApp widget (any three).
9. Restart kills/starts; reload in cluster mode is 0-downtime if graceful (falls back to restart on timeout). kill_timeout 1,600 ms; listen_timeout 3,000 ms; wait_ready waits for process.send('ready').
10. OPcache keyed on the symlink path keeps old code; php-fpm reload drops requests. Use `$realpath_root` for SCRIPT_FILENAME and DOCUMENT_ROOT (Caddy resolve_root_symlink; Apache opcache.revalidate_path).
11. e.g. `delivery_band` added nullable → code writes both old `zone` and new `delivery_band` → backfill in batches → later deploy drops `zone`. Fresh backup + lead sign-off when the migration isn't backward compatible.
12. Graded: script, run, 0 errors; typical fixes: reload not restart, cluster ≥ 2, graceful SIGINT, wait_ready, kill_timeout raised.
13. Offline encrypted backups; regularly test availability/integrity in a DR scenario; golden images (and logs ≥ 1 year). Map: live VM / encrypted nightly Drive / third copy the server can't delete — the owner decision.
14. NaCl SecretBox (XSalsa20 + Poly1305), scrypt-derived key, 64 KiB chunks; doesn't hide file length or mtime; data unrecoverable, password can't be changed in place; `rclone cryptcheck`.
15. Graded: staging only, pg_restore, row counts vs production, latest order timestamp, 5-order sample, app smoke, RPO/RTO recorded, Telegram summary.
16. Revoke → rotate → delete from code/logs/systems → record lifecycle. Env vars readable by other processes, may land in logs/dumps; never Docker ENV/ARG.
17. Azure Key Vault via managed identity, or an age key file (root-only) sealed-backed-up with the owner; a stolen DB alone must be useless ciphertext.
18. A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions. Examples: A01 customer B reads A's order/invoice; A08 unverified payment callback; A10 payment timeout treated as paid.
19. Fetch Metadata (Sec-Fetch-Site) primary; fallback to Origin header checks mandatory; SameSite = defence in depth only (plus framework tokens; no state-changing GET).
20. Validate with the Order Validation API (val_id, store_id, store_passwd); match amount, currency (BDT) and our tran_id; risk 1 = risky → review queue, the owner's fulfilment decision.
21. Verified: none of bKash/Nagad official docs read; third-party sources describe bKash grant→create→execute→query→refund and SNS-style webhooks; Nagad only community libraries. So: code only the gateway-independent rules (server-side confirmation, amount match, idempotency, state machine) and leave field-level integration until the official merchant docs are in hand.
22. Latency (p95 PDP/checkout), traffic (orders/hour vs last weeks), errors (5xx %, failed validations), saturation (disk/DB connections, disk-full forecast). ~1 msg/s per chat, 20/min per group, ~30/s bulk; dedupe/group, edit messages, queue with backoff, SMS fallback for P1.
23. April 2025; replaced SP 800-61r2; Govern, Identify, Protect, Detect, Respond, Recover. Any four: visible downtime > threshold, any data loss/exposure, rollback/emergency action, resolution > threshold, monitoring failed (owner found it first), owner request.
24. Graded: scroll within 40 px, URL check, not blank; WebKit in Playwright is desktop WebKit with emulated touch — real iPhone pass required (Shilpi U08 script).
25. Graded: stable IDs, group, P1 (money), automated, owner_agent bhandari, 5 real addresses incl. Bogura variants, known-bad fixture (district matching off → all fail), Quick (every deploy) + weekly.
