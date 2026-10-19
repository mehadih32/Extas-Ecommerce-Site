# shellcheck shell=bash
# PR 1 — record the machine's specs (CN-002). Read-only.
step_specs() {
  local cpu mem_gb os kernel region size zone accel imds
  cpu="$(nproc)"
  mem_gb="$(awk '/^MemTotal:/{printf "%.1f", $2/1024/1024}' /proc/meminfo)"
  os="$(. /etc/os-release && echo "$PRETTY_NAME")"
  kernel="$(uname -r)"
  imds="$(curl -fsS -m 3 -H Metadata:true 'http://169.254.169.254/metadata/instance/compute?api-version=2021-02-01' 2>/dev/null || true)"
  if [ -n "$imds" ]; then
    region="$(jq -r '.location // "?"' <<<"$imds")"
    size="$(jq -r '.vmSize // "?"' <<<"$imds")"
    zone="$(jq -r '.zone // "-"' <<<"$imds")"
  else
    region="?"; size="?"; zone="?"
  fi
  accel="off"
  if find /sys/class/net/*/device/driver -maxdepth 0 -exec readlink {} + 2>/dev/null | grep -qiE 'mana|mlx'; then accel="on"; fi
  {
    echo "## Machine"
    echo
    echo "| Item | Value |"
    echo "|---|---|"
    echo "| Size | $size |"
    echo "| Region / zone | $region / $zone |"
    echo "| CPU | $cpu vCPU ($(lscpu | awk -F: '/Model name/{gsub(/^ +/,"",$2); print $2; exit}')) |"
    echo "| RAM | $mem_gb GiB |"
    echo "| OS | $os, kernel $kernel |"
    echo "| Accelerated networking | $accel |"
    echo
    echo "### Disks"
    echo
    echo '```'
    lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL 2>/dev/null | sed 's/[[:space:]]*$//'
    echo '```'
    echo
    echo "## Steps"
    echo
    echo "| Step | Result | Detail |"
    echo "|---|---|---|"
  } >> "$REPORT_FILE"
  [ "$cpu" -ge 1 ] || return 1
  report OK "PR 1 · specs recorded" "$size, $cpu vCPU, $mem_gb GiB, $region"
}
