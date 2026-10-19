# shellcheck shell=bash
# PR 2 — verify Ubuntu 24.04 LTS and apply all updates. No in-place release upgrade (new VM).
step_os() {
  local ver
  ver="$(. /etc/os-release && echo "$VERSION_ID")"
  if [ "$ver" != "24.04" ]; then report FAIL "PR 2 · OS" "expected Ubuntu 24.04, found $ver"; return 1; fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q >/dev/null
  apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold full-upgrade >/dev/null
  apt_install curl jq ca-certificates gnupg lvm2 rsync ufw fail2ban unattended-upgrades \
    apt-listchanges rclone gpg zstd pigz nvme-cli sysstat
  if [ -f /var/run/reboot-required ]; then
    report WARN "PR 2 · OS updates" "Ubuntu $ver up to date; a reboot is pending (done automatically at $EXTAS_AUTO_REBOOT_TIME)"
  else
    report OK "PR 2 · OS updates" "Ubuntu $ver up to date"
  fi
}
