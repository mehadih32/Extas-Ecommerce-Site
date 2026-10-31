# Server report — 2026-10-31 12:48 +06

Run by `infra/server/setup.sh` (S0A) from commit `19d12457c1cde341f0b5cf99bdbf1d4321c454d8`. Overall: **NEEDS ATTENTION**.

## Machine

| Item | Value |
|---|---|
| Size | Standard_E8ds_v6 |
| Region / zone | MalaysiaWest / 1 |
| CPU | 8 vCPU (INTEL(R) XEON(R) PLATINUM 8573C) |
| RAM | 62.8 GiB |
| OS | Ubuntu 24.04.5 LTS, kernel 7.0.0-1017-azure |
| Accelerated networking | on |

### Disks

```
NAME              SIZE TYPE FSTYPE      MOUNTPOINTS              MODEL
nvme0n1           128G disk                                      MSFT NVMe Accelerator v1.0
├─nvme0n1p1       127G part ext4        /
├─nvme0n1p14        4M part
├─nvme0n1p15      106M part vfat        /boot/efi
└─nvme0n1p16      913M part ext4        /boot
nvme0n2             1T disk LVM2_member                          MSFT NVMe Accelerator v1.0
├─extas-base       10G lvm  ext4        /srv/extas
├─extas-postgres  250G lvm  ext4        /srv/extas/data/postgres
├─extas-redis      20G lvm  ext4        /srv/extas/data/redis
├─extas-search     30G lvm  ext4        /srv/extas/data/search
├─extas-media     100G lvm  ext4        /srv/extas/data/media
├─extas-backup    150G lvm  ext4        /srv/extas/backups
├─extas-logs       30G lvm  ext4        /srv/extas/logs
├─extas-docker    200G lvm  ext4        /var/lib/docker
└─extas-swap       16G lvm  swap        [SWAP]
nvme1n1           440G disk ext4        /mnt/nvme                Microsoft NVMe Direct Disk v2
```

## Steps

| Step | Result | Detail |
|---|---|---|
| PR 1 · specs recorded | OK | Standard_E8ds_v6, 8 vCPU, 62.8 GiB, MalaysiaWest |
| PR 2 · OS updates | OK | Ubuntu 24.04 up to date |
| PR 3 · hardening | OK | SSH key-only, root login off, fail2ban on, security updates on (reboot 04:30), UFW 22/80/443, Asia/Dhaka, host extas-vm |
| PR 601 · NVMe | OK | /dev/nvme1n1 mounted at /mnt/nvme, 433 GB free; unit runs at every boot before Docker |
| PR 3 · data disk | OK | /dev/nvme0n2 → VG extas: 8 volumes + 16 GB swap mounted, 217.97g free for growth |
| kernel tuning | OK | sysctl (backlog, fq+bbr, swappiness 10), THP off, nofile 65536 |
| PR 3 · Cloudflare-only | INFO | off (setting EXTAS_UFW_CLOUDFLARE_ONLY) |
| PR 4 · Docker | OK | Docker version 29.9.2, compose 5.6.1; logs rotated; build cache ≤ 40 GB; starts after NVMe + data disk |
| osdisk | FAIL | step failed (see the workflow log) |
| PR 604 · auto profile | OK | 8 vCPU / 64 GB → 6 app replicas, PG 16 GB |
| PR 620 · client address | INFO | Cloudflare's ranges written for Caddy; checked live after the reload |
| PR 620 · client address | OK | live: CF-Connecting-IP believed from Cloudflare's ranges only (trusted_proxies in Caddy's running configuration) |
| PR 139 · app database role | OK | extas_app may add to the audit log and the history tables, never change or remove them |
| PR 5 · PostgreSQL | OK | v17.11 (Debian 17.11-1.pgdg13+2), shared_buffers 16GB, temp on NVMe, WAL archive on, slow log > 100 ms, PgBouncer (transaction pool) |
| PR 6 · Redis | OK | cache (LRU, NVMe) + queue (no eviction, AOF on data disk) |
| PR 7 · Caddy | OK | new.extas.com.bd, auto HTTPS, HTTP/3, password + noindex |
| stack health | INFO | caddy:healthy meilisearch:healthy pgbouncer:healthy postgres:healthy redis-cache:healthy redis-queue:healthy  |
| PR 8 · backup (data disk) | FAIL | first backup failed |
| PR 8 · Azure Blob | INFO | off — not connected — add the key in Keys & connections |
| PR 8 · Google Drive | INFO | off — not connected — add the key in Keys & connections |
| PR 8 · restore test | FAIL | restored database did not come up |
| PR 9 · monitoring | OK | every minute: disks (80%), services, NVMe, backups, speed; Telegram not connected — alerts go to the log until the Telegram bot is added in Keys & connections; problems now: ডিস্ক /srv/extas/backups 93% ভরে গেছে; ব্যাকআপ ফেরানোর পরীক্ষা ব্যর্থ |
| PR 10 · k6 baseline | INFO | kept from 2026-10-20T02:40:47+06:00: p95 7.21 ms at 15044 req/s |
| public HTTPS | OK | https://new.extas.com.bd answers (401 — password page) |

## OS disk (/) — before this run

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/root       123G   13G  110G  11% /
```

| Folder | On the OS disk | Note |
|---|---|---|
| `/var/lib/containerd` | 9.0 GB |  |
| `/var/lib/docker` | 0.0 GB | own volume here (177M used on it) |
| `/home/ghrunner/actions-runner` | 1.2 GB |  |
| `/home/ghrunner/actions-runner/_work` | 0.5 GB |  |
| `/home/ghrunner/actions-runner/_diag` | 0.0 GB |  |
| `/home` | 1.2 GB |  |
| `/root` | 0.0 GB |  |
| `/var/log` | 0.2 GB |  |
| `/var/log/journal` | 0.1 GB |  |
| `/var/cache` | 0.1 GB |  |
| `/var/tmp` | 0.0 GB |  |
| `/tmp` | 0.0 GB |  |

Largest folders on the OS disk:

- `/var` 9.6 GB
- `/var/lib` 9.3 GB
- `/var/lib/containerd` 9.0 GB
- `/usr` 2.1 GB
- `/home` 1.2 GB
- `/home/ghrunner` 1.2 GB
- `/home/ghrunner/actions-runner` 1.2 GB
- `/usr/lib` 1.2 GB
- `/usr/bin` 0.4 GB
- `/usr/lib/x86_64-linux-gnu` 0.4 GB

## Auto profile (PR 604)

Detected 8 vCPU / 64 GB (reference box: yes).

| Service | RAM limit | CPU |
|---|---|---|
| PostgreSQL | 16 GB (shared_buffers), container cap 20 GB | 3.00 |
| Redis (cache + queue) | 4096 + 2048 MB | 1.00 |
| Meilisearch | 4096 MB | 1.00 |
| App | 6 × 2730 MB | 6 × 1.00 |
| Image/video worker | 6144 MB | 2.00 |
| Background jobs | 4096 MB | 1.00 |
| Caddy | 1024 MB | 1.00 |
| OS reserve | 11264 MB | — |
