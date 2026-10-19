# R01 · Linux VPS hardening on Azure — SSH keys, firewall, fail2ban, unattended upgrades

*Prohori প্রহরী · A360-02 · module 1 of 11 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

Target: the EXTAS Azure VM (profile: E8ds v4, Ubuntu LTS assumed — confirm the image). Every change here is a server
change → logged, done on staging first, and anything that could lock us out has a tested way back in.

---

## 1. Azure layer first (outside the VM) [OFFICIAL — Microsoft Learn, Azure VM security]

- **SSH public-key login only** — Microsoft: passwords are open to brute force on internet-facing VMs.
- **Lock inbound ports with the Network Security Group (NSG).** Defender for Cloud **just-in-time (JIT) access** opens a port (e.g. 22) in the NSG only for an approved request and closes it afterwards.
- Managed disks are **encrypted at rest by default** (256-bit AES, server-side); Azure Disk Encryption (dm-crypt on Linux, keys in Key Vault) adds OS-level encryption.
- **Managed identities** let the VM reach Key Vault and other Entra-protected services **without credentials in code** (R05).
- **Azure RBAC: least privilege** for people on the subscription.

**EXTAS NSG baseline [HOUSE]:** inbound 443 (and 80 for redirect/ACME) from Internet → allow; 22 → **deny from Internet**, open via JIT or allow only the owner's/lead's fixed IP; everything else deny. Two independent layers (NSG + host firewall) — a mistake in one doesn't expose the server (the "provider-level firewall as a second layer" advice in §3).

## 2. SSH [OFFICIAL basis — Microsoft Learn; HOUSE settings]

`/etc/ssh/sshd_config.d/10-extas.conf`:
```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers extas-admin extas-deploy
MaxAuthTries 3
```
- One key per person/machine (ed25519), named; remove a key the day someone leaves.
- `extas-deploy` user: only what CI needs (no sudo, or a narrow sudoers line for `systemctl reload`).
- **Before closing the old session:** test login from a second terminal. Keep Azure serial console access as the break-glass path.

## 3. Host firewall (UFW) [OFFICIAL — Ubuntu community docs]

```
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH        # or: from <admin IP> to any port 22
sudo ufw allow 80,443/tcp
sudo ufw enable && sudo ufw status verbose
```
- UFW is **off by default**; `status verbose` shows the default policies; delete rules by number (`ufw status numbered`, `ufw delete N`) **[OFFICIAL — Ubuntu]**.
- **Docker caveat:** published container ports (`-p 5432:5432`) are NAT-forwarded **before** UFW's INPUT rules — `ufw status` looks fine while the port is open to the world. Docker's own docs say the two are incompatible **[COMMUNITY — one guide read (it quotes Docker's docs); the outside scan below is the real proof, so the check costs nothing]**. Fixes, best first: publish only to loopback (`127.0.0.1:5432:5432`) or don't publish (internal Docker network behind the reverse proxy); filter in the `DOCKER-USER` chain; check from **outside** with `nmap`/`nc` after every deploy and reboot.
- **EXTAS rule [HOUSE]:** PostgreSQL, Redis, admin dashboards, Uptime Kuma — never published on 0.0.0.0.

## 4. fail2ban [COMMUNITY — Hostinger tutorial; test before use]

- Copy settings into `jail.local` (package updates can replace `jail.conf`).
- sshd jail: `enabled = true`; example values `bantime = 3600`, `findtime = 600`, `maxretry = 5`; `bantime.increment = true` doubles bans for repeat offenders.
- **Put the admin IPs in `ignoreip` before enabling** or you can lock yourself out.
- Check: `fail2ban-client status sshd`; test config: `fail2ban-client -t`; unban: `fail2ban-client set sshd unbanip <ip>`.
- With password login off and 22 closed by NSG/JIT, fail2ban is a **second** layer; its bigger EXTAS use is an **nginx jail for login/OTP abuse** (R06 rate limits are the first layer).

## 5. Unattended upgrades [OFFICIAL — Ubuntu Server docs]

- Files: `/etc/apt/apt.conf.d/50unattended-upgrades` (what/reboot/mail) and `20auto-upgrades` (daily by default).
- Default allowed origins = **security pocket (+ ESM)**; general `-updates` stays commented out.
- `Automatic-Reboot` default **false**; when true, set `Automatic-Reboot-Time "03:30"` (local time) — **[HOUSE]** BD night, after the nightly backup (R04).
- `Mail` + `MailReport "only-on-error"` needs a mail client; **[HOUSE]** EXTAS sends the result to Telegram instead (R08).
- Logs: `/var/log/unattended-upgrades/`; dry run: `sudo unattended-upgrade -v --dry-run`.

## 6. Hardening checklist (run quarterly and after rebuilds)

- [ ] NSG: only 80/443 public; 22 via JIT/IP allow-list
- [ ] SSH: keys only, no root, named keys list matches people list
- [ ] UFW active; `nmap` from outside shows only 80/443 (and 22 if allowed)
- [ ] No container port published on 0.0.0.0 except the reverse proxy
- [ ] fail2ban jails active (sshd, nginx-login); admin IPs ignored
- [ ] Unattended security upgrades on; last run OK; reboot window set; result to Telegram
- [ ] Time sync on (logs and TLS depend on it); timezone recorded (UTC on server, BDT in reports)
- [ ] Break-glass: serial console tested this quarter

## 7. Worked EXTAS example — "Redis is open to the internet"
Audit runner (R11) external scan finds 6379 open. Cause: compose file `ports: ["6379:6379"]`. Fix: remove `ports`, app reaches Redis on the Docker network; redeploy; re-scan from outside → closed; add a CI check that fails on any `ports:` other than the proxy's; postmortem (R09) because data exposure was possible.

---

**Sources** (type in brackets):
- [Official — Microsoft Learn] Secure and use policies on virtual machines in Azure: https://learn.microsoft.com/azure/virtual-machines/security-policy
- [Official — Ubuntu Server docs] Automatic updates: https://ubuntu.com/server/docs/how-to/software/automatic-updates/
- [Official — Ubuntu community help] UFW: https://help.ubuntu.com/community/UFW
- [Practitioner guide] Findstack, UFW isn't blocking your Docker ports (quotes Docker docs): https://findstack.com/resources/ufw-not-blocking-docker-ports
- [Vendor tutorial] Hostinger, How to configure Fail2Ban: https://www.hostinger.com/tutorials/fail2ban-configuration/
- [Internal] prohori.md (Azure E8ds v4, Docker, Caddy, Cloudflare); master register PR 7–9

*As of October 2026.*
