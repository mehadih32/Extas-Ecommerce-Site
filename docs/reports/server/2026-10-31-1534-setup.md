# Server report — 2026-10-31 15:34 +06

Run by `infra/server/setup.sh` (S0A) from commit `1a9564886a3b0b3ec6f54837b92e46bada6695dc`. Overall: **NEEDS ATTENTION**.

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
NAME                SIZE TYPE FSTYPE      MOUNTPOINTS                            MODEL
nvme0n1             128G disk                                                    MSFT NVMe Accelerator v1.0
├─nvme0n1p1         127G part ext4        /tmp/tmp.74CoW7UNbi
│                                         /
├─nvme0n1p14          4M part
├─nvme0n1p15        106M part vfat        /boot/efi
└─nvme0n1p16        913M part ext4        /boot
nvme0n2               1T disk LVM2_member                                        MSFT NVMe Accelerator v1.0
├─extas-base         10G lvm  ext4        /srv/extas
├─extas-postgres    250G lvm  ext4        /srv/extas/data/postgres
├─extas-redis        20G lvm  ext4        /srv/extas/data/redis
├─extas-search       30G lvm  ext4        /srv/extas/data/search
├─extas-media       100G lvm  ext4        /srv/extas/data/media
├─extas-backup      150G lvm  ext4        /srv/extas/backups
├─extas-logs         30G lvm  ext4        /srv/extas/logs
├─extas-docker      200G lvm  ext4        /var/lib/docker
├─extas-swap         16G lvm  swap        [SWAP]
└─extas-containerd  120G lvm  ext4        /tmp/tmp.74CoW7UNbi/var/lib/containerd
                                          /var/lib/containerd
nvme1n1             440G disk ext4        /mnt/nvme                              Microsoft NVMe Direct Disk v2
```

## Steps

| Step | Result | Detail |
|---|---|---|
| PR 1 · specs recorded | OK | Standard_E8ds_v6, 8 vCPU, 62.8 GiB, MalaysiaWest |
| PR 2 · OS updates | OK | Ubuntu 24.04 up to date |
| PR 3 · hardening | OK | SSH key-only, root login off, fail2ban on, security updates on (reboot 04:30), UFW 22/80/443, Asia/Dhaka, host extas-vm |
| PR 601 · NVMe | OK | /dev/nvme1n1 mounted at /mnt/nvme, 433 GB free; unit runs at every boot before Docker |
| PR 3 · data disk | OK | /dev/nvme0n2 → VG extas: 8 volumes + 16 GB swap mounted, 97.97g free for growth |
| kernel tuning | OK | sysctl (backlog, fq+bbr, swappiness 10), THP off, nofile 65536 |
| PR 3 · Cloudflare-only | INFO | off (setting EXTAS_UFW_CLOUDFLARE_ONLY) |
| PR 4 · Docker | OK | Docker version 29.9.2, compose 5.6.1; logs rotated; build cache ≤ 40 GB; starts after NVMe + data disk |
| PR 4 · image check | FAIL | caddy:2.10-alpine is still broken after a fresh pull |
| PR 4 · image check | FAIL | getmeili/meilisearch:v1.15 is still broken after a fresh pull |
| PR 4 · image check | FAIL | postgres:17 is still broken after a fresh pull |
| PR 4 · image check | FAIL | redis:7.4-alpine is still broken after a fresh pull |
| PR 4 · image check | OK | files had gone missing in the store: made again by the stack step: extas-caddy extas-meilisearch extas-pgbouncer extas-postgres extas-redis-cache extas-redis-queue; pulled again: none; built again: extas/pgbouncer:local |
| PR 4 · OS disk | FAIL | / 4% used, 120 GB free (a deploy needs 15); containerd store: on its own volume (16G used of 120G); build cache ≤ 40 GB; journal ≤ 1024 MB; runner logs 7 days |
| PR 604 · auto profile | OK | 8 vCPU / 64 GB → 6 app replicas, PG 16 GB |
| PR 620 · client address | INFO | Cloudflare's ranges written for Caddy; checked live after the reload |
| PR 5–7 · stack | FAIL | compose up failed: Error response from daemon: No such image: getmeili/meilisearch:v1.15 Error response from daemon: No such image: postgres:17  |
| run stopped | FAIL | later steps depend on 'stack' |

## OS disk (/) — before this run

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/root       123G  4.3G  119G   4% /
```

| Folder | On the OS disk | Note |
|---|---|---|
| `/var/lib/containerd` | 0.0 GB | own volume here (16G used on it) |
| `/var/lib/docker` | 0.0 GB | own volume here (146M used on it) |
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

- `/usr` 2.1 GB
- `/home` 1.2 GB
- `/home/ghrunner` 1.2 GB
- `/home/ghrunner/actions-runner` 1.2 GB
- `/usr/lib` 1.2 GB
- `/var` 0.6 GB
- `/usr/bin` 0.4 GB
- `/usr/lib/x86_64-linux-gnu` 0.4 GB
- `/usr/share` 0.3 GB
- `/var/lib` 0.3 GB

Docker image store: overlayfs (driver-type=io.containerd.snapshotter.v1 ); Docker folder: /var/lib/docker.

## OS disk (/) — after this run

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/root       123G  3.9G  120G   4% /
```

| Folder | On the OS disk | Note |
|---|---|---|
| `/var/lib/containerd` | 0.0 GB |  |
| `/var/lib/docker` | 0.0 GB | own volume here (140M used on it) |
| `/home/ghrunner/actions-runner` | 1.2 GB |  |
| `/home/ghrunner/actions-runner/_work` | 0.5 GB |  |
| `/home/ghrunner/actions-runner/_diag` | 0.0 GB |  |
| `/home` | 1.2 GB |  |
| `/root` | 0.0 GB |  |
| `/var/log` | 0.2 GB |  |
| `/var/log/journal` | 0.1 GB |  |
| `/var/cache` | 0.0 GB |  |
| `/var/tmp` | 0.0 GB |  |
| `/tmp` | 0.0 GB |  |

Largest folders on the OS disk:

- `/usr` 2.1 GB
- `/home` 1.2 GB
- `/home/ghrunner` 1.2 GB
- `/home/ghrunner/actions-runner` 1.2 GB
- `/usr/lib` 1.2 GB
- `/var` 0.5 GB
- `/usr/bin` 0.4 GB
- `/usr/lib/x86_64-linux-gnu` 0.4 GB
- `/usr/share` 0.3 GB
- `/var/lib` 0.3 GB

Docker image store: overlayfs (driver-type=io.containerd.snapshotter.v1 ); Docker folder: /var/lib/docker.

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
