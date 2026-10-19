# Prohori · Doesn't work / myths (systems, security, reliability, QA)

| # | Myth | Evidence | Do instead |
|---|---|---|---|
| 1 | "UFW is on, so my Docker ports are closed." | Published container ports are forwarded before UFW's INPUT rules; `ufw status` looks fine while the port is open (guide quoting Docker docs). | Bind to 127.0.0.1 or don't publish; scan from outside (R01). |
| 2 | "fail2ban is our SSH security." | With password login off and port 22 closed by NSG/JIT it's only a second layer (Microsoft: use SSH keys; JIT). | Keys only + NSG/JIT; fail2ban mainly for app login abuse. |
| 3 | "Unattended upgrades install everything and reboot when needed." | Default = security pocket only; automatic reboot is off by default (Ubuntu docs). | Set a reboot window after the backup; report to Telegram. |
| 4 | "Certificates last a year; renew by hand." | Let's Encrypt 90 days now, 45-day max by Feb 2028; industry cap 47 days from Mar 2029. | Automatic renewal + expiry alerts (R02). |
| 5 | "`systemctl restart nginx` is fine for config changes." | Restart stops the service; reload starts new workers and retires old ones gracefully. | `nginx -t` then reload. |
| 6 | "`pm2 restart` is zero downtime." | Only cluster mode + reload claims 0-second downtime, and only if the app shuts down gracefully (PM2 docs). | Cluster, reload, SIGINT handler, wait_ready (R03). |
| 7 | "Switching the `current` symlink deploys new PHP code instantly." | OPcache can keep serving old code via the symlink path (Deployer docs). | `$realpath_root` in fastcgi params. |
| 8 | "A backup we've never restored is a backup." | CISA: regularly test availability and integrity in a DR scenario. | Monthly restore drill, RPO/RTO recorded (R04). |
| 9 | "Encrypted on Drive = nobody learns anything." | rclone crypt hides content and names but not file length or modification time. | Accept; don't put meaning in sizes/timing. |
| 10 | "Restarting the app revokes a leaked key." | OWASP: revocation must happen at the backing service. | Revoke → rotate → delete → record (R05). |
| 11 | "SameSite cookies solve CSRF." | OWASP: defence in depth only; use framework tokens + Fetch Metadata/Origin. | R06 §2. |
| 12 | "The success redirect means the customer paid." | SSLCommerz: you must validate with the Order Validation API; IPN arrives before the customer returns. | Server-to-server confirmation + amount match (R07). |
| 13 | "Playwright's iPhone profile is an iPhone." | Desktop WebKit, emulated touch; mobile Safari quirks not reproduced (Playwright frames it as emulation; vendor example of different rendering). | Real-iPhone pass before closing iOS bugs (R10). |
| 14 | "Retries fixed the flaky test." | Playwright reports a fail-then-pass as "flaky", not passed. | Track and fix flakes; quarantine rule (R10). |
| 15 | "axe passing = accessible." | Playwright docs: automated tests catch only some WCAG violations. | Manual checks + Shilpi U04 checklist. |

Sources: see R01–R11.

*As of October 2026.*
