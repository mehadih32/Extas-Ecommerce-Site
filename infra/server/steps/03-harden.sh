# shellcheck shell=bash
# PR 3 — base hardening (A2.9.14): SSH keys only, no root login, fail2ban, unattended security updates, UFW 22/80/443,
# timezone and hostname. Port 22 is NOT limited to one IP (build agents and the owner connect from changing IPs).
step_harden() {
  local changed

  # Timezone and hostname
  [ "$(timedatectl show -p Timezone --value)" = "$EXTAS_TIMEZONE" ] || timedatectl set-timezone "$EXTAS_TIMEZONE"
  [ "$(hostnamectl --static)" = "$EXTAS_HOSTNAME" ] || hostnamectl set-hostname "$EXTAS_HOSTNAME"
  grep -q "127.0.1.1 $EXTAS_HOSTNAME" /etc/hosts || echo "127.0.1.1 $EXTAS_HOSTNAME" >> /etc/hosts

  # SSH: our drop-in sorts before Ubuntu's 50-cloud-init / 60-cloudimg files, and in sshd the first value wins.
  # Safety: only switch passwords off when at least one user already has an authorized key.
  if ! find /home /root -maxdepth 3 -name authorized_keys -size +0 2>/dev/null | grep -q .; then
    report FAIL "PR 3 · SSH" "no authorized_keys found for any user — refusing to switch password login off"
    return 1
  fi
  changed="$(write_file /etc/ssh/sshd_config.d/10-extas.conf 0644 <<'CONF'
# EXTAS (PR 3) — managed by infra/server/steps/03-harden.sh
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
CONF
)"
  if [ -n "$changed" ]; then
    sshd -t || { rm -f /etc/ssh/sshd_config.d/10-extas.conf; report FAIL "PR 3 · SSH" "sshd config test failed, change rolled back"; return 1; }
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  fi

  # fail2ban for sshd (systemd journal backend on 24.04)
  changed="$(write_file /etc/fail2ban/jail.d/extas.local 0644 <<'CONF'
# EXTAS (PR 3)
[DEFAULT]
bantime = 1h
bantime.increment = true
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
CONF
)"
  systemctl enable --now fail2ban >/dev/null 2>&1 || true
  [ -n "$changed" ] && systemctl restart fail2ban

  # Unattended security updates, with the automatic reboot time from the config file
  write_file /etc/apt/apt.conf.d/20auto-upgrades 0644 >/dev/null <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
  write_file /etc/apt/apt.conf.d/52extas-unattended 0644 >/dev/null <<CONF
// EXTAS (PR 3) — security updates only (the default origins); Docker's repo is never auto-upgraded.
Unattended-Upgrade::Automatic-Reboot "$( [ "$EXTAS_AUTO_REBOOT" = yes ] && echo true || echo false )";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "$EXTAS_AUTO_REBOOT_TIME";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
CONF
  systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

  # UFW: deny in, allow out; 22, 80, 443 (and 443/udp for HTTP/3)
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null

  report OK "PR 3 · hardening" "SSH key-only, root login off, fail2ban on, security updates on (reboot $EXTAS_AUTO_REBOOT_TIME), UFW 22/80/443, $EXTAS_TIMEZONE, host $EXTAS_HOSTNAME"
}

# Docker publishes ports through its own iptables chain, which UFW does not see. When the optional
# "Cloudflare only" setting is on, 80/443 are filtered in DOCKER-USER (re-applied after Docker starts).
apply_cloudflare_only() {
  iptables -N EXTAS-CF 2>/dev/null || iptables -F EXTAS-CF
  if [ "$EXTAS_UFW_CLOUDFLARE_ONLY" != "yes" ]; then
    iptables -D DOCKER-USER -p tcp -m multiport --dports 80,443 -j EXTAS-CF 2>/dev/null || true
    report INFO "PR 3 · Cloudflare-only" "off (setting EXTAS_UFW_CLOUDFLARE_ONLY)"
    return 0
  fi
  local ips
  ips="$(curl -fsS -m 10 https://www.cloudflare.com/ips-v4)" || { report WARN "PR 3 · Cloudflare-only" "could not fetch Cloudflare IP list; left open"; return 0; }
  for ip in $ips; do iptables -A EXTAS-CF -s "$ip" -j RETURN; done
  iptables -A EXTAS-CF -j DROP
  iptables -C DOCKER-USER -p tcp -m multiport --dports 80,443 -j EXTAS-CF 2>/dev/null \
    || iptables -I DOCKER-USER -p tcp -m multiport --dports 80,443 -j EXTAS-CF
  report OK "PR 3 · Cloudflare-only" "80/443 accept Cloudflare ranges only"
}
