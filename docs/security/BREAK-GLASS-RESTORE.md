# Break-glass restore runbook (PR 385; Blueprint B6.1, B6.2)

> **বাংলায় এক লাইনে:** সাইট হ্যাক হলে, ডেটাবেস নষ্ট হলে বা সার্ভার হারালে কী কী ধাপে দোকান ফেরানো হবে, সেটা এখানে লেখা। আসল (লাইভ)
> ডেটাবেস বদলানোর আগে সবসময় মালিকের লেখা অনুমতি লাগে।

This is the written plan for the day something goes badly wrong. It is for the agent on duty (Prohori) and for whoever
helps the owner. Every step runs through GitHub Actions on the VM's runner (CN-003: no SSH from the cloud), or from the
Azure portal's **Run command** when the runner itself is gone.

**The one rule:** nothing replaces the live database, and nothing is deleted, without the owner's written OK in the
chat (CLAUDE.md rule 6). Checking, copying and restoring into a *staging* copy need no OK and should start at once.

---

## 0. Which situation is this?

| What happened | Go to |
|---|---|
| Wrong data written (a bad import, a bug that changed orders), the server is fine | §3 — restore to a minute before it happened |
| The database will not start, or its files are damaged | §3 — newest restore from Blob |
| Someone got into the server or the admin (strange admin logins, changed keys, unknown files) | §2 first, then §3 or §4 |
| The VM is gone, cannot boot, or cannot be trusted any more | §4 — rebuild on a fresh VM |
| Azure Blob itself is unavailable | §3 with `from = drive` (the encrypted daily dump on Google Drive) |

## 1. Before the bad day: lock the off-server copies (one time)

> **বাংলায়:** ব্লবের ব্যাকআপ "লক" করা থাকলে, কেউ সার্ভার দখল করলেও পুরনো ব্যাকআপ মুছতে পারবে না। লক একবার দিলে আর ছোট করা যায় না,
> তাই এটা করার আগে মালিকের লেখা অনুমতি লাগে।

Immutable backups (B6.1) mean an attacker who takes the server cannot delete the copies in Azure Blob. Three things in
Azure, done once by the owner in the portal (or by an agent with his written OK):

1. **Immutability policy on the container** (`extas-backups`; the name is `BACKUP_BLOB_CONTAINER`): Storage account →
   Containers → `extas-backups` → **Access policy** → **Add policy** → *Time-based retention*, at least
   `BACKUP_KEEP_BLOB_DAYS` days (35 now). Save it **unlocked** first, run §1.4, and only then **Lock** it.
   *A locked policy cannot be shortened or removed, and Azure keeps charging for the copies until they age out:
   the owner's written OK is needed for the lock.*
2. **Lifecycle rule** (Storage account → Data management → **Lifecycle management**): delete blobs in `extas-backups/`
   older than `BACKUP_KEEP_BLOB_DAYS` + 1 days. This replaces the server's own Blob pruning, which stops when the lock
   is on.
3. **A key that cannot delete:** the Blob key the owner types into the admin's *Keys & connections* is a SAS URL for the
   container with **Read, Add, Create, Write, List** only — no Delete, no Permanent delete, no Immutable storage, no
   Set policy. (The vault writes it to the server for rclone with PR 507; until then Blob stays "not connected".)
4. **Switch the server over:** set `BACKUP_IMMUTABLE="yes"` in `infra/config/server.conf` (its own register PR or CN
   note), merge, and run `server-setup.yml`. From then on:
   - every copy goes up with `--immutable` (an existing copy is never overwritten);
   - `extas-backup prune` never deletes in Blob;
   - every daily backup runs `extas-backup lock-check`: it adds a small marker under `lock-check/` and tries to delete
     it with the server's own key. The delete **must be refused**. If it works, the check fails, the daily backup
     reports a failure, and the monitor raises "ব্যাকআপ লক কাজ করছে না" (`state/backup-lock-blob.json`).

Google Drive (the second target, B6.2) cannot be locked the same way. Its copies are encrypted with the server's
`backup.key`, of which the owner keeps a copy in the vault, so a stolen Drive folder cannot be read.

## 2. If someone got in: stop the damage first

> **বাংলায়:** কেউ ঢুকে পড়লে আগে দরজা বন্ধ: সবার লগইন শেষ, পাসওয়ার্ড আর কী বদল। কাউকে ব্লক করা মালিকের অনুমতি ছাড়া নয়।

1. **Admin sign-ins:** the owner uses *Settings → Sign-in & security* → **Log out everywhere else** (PR 379) and changes
   his password. If he cannot sign in, run `owner-reset.yml` (docs/owner/OWNER-LOGIN.md).
2. **Keys:** in *Keys & connections*, replace every live key (payment gateways, courier, SMS, Blob, Drive) at its
   provider, then type the new one in. Old keys are switched off at the provider, not only here.
3. **Look before touching:** read the security events on *Settings → Sign-in & security* (PR 380) and the audit log
   (the append-only `AuditLog` table; its admin page, SET-04c, comes with PR 496) for the first strange action; note
   its time. That time is the restore target in §3.
4. **Blocking an address or a person is the owner's decision** (CLAUDE.md rule 6): propose it with the evidence; do not
   block on your own.
5. **Do not delete anything on the server.** It is evidence; the restore keeps the old data aside anyway.
6. If the server itself cannot be trusted (unknown processes, changed system files, a changed runner), skip to §4.

## 3. Restore the database (the `restore.yml` workflow)

> **বাংলায়:** প্রথমে পাশে একটা কপি ফিরিয়ে মিলিয়ে দেখা হয় (লাইভ সাইটে হাত লাগে না)। সব ঠিক থাকলে, মালিকের লেখা অনুমতি নিয়ে লাইভ
> ডেটাবেস বদলানো হয়। পুরনো ডেটা মোছা হয় না, আলাদা করে রাখা থাকে।

GitHub → Actions → **restore** → *Run workflow*. It runs `infra/server/bin/extas-restore` on the VM.

1. **Prove the backups are good** (no OK needed): `mode = test`. It restores the newest local backup into a throwaway
   database, compares the tables, brings one product photo back and checks its checksum, and checks the docs bundle.
2. **Restore a copy beside the live one** (no OK needed): `mode = staging`, `from = blob` (or `local` when the server's
   disks are fine and trusted, `drive` when Blob is unavailable), and `at = "YYYY-MM-DD HH:MM"` one minute before the
   first bad action from §2.3 (Dhaka time; `local` and `blob` only — Drive has the daily dump). The copy runs as the
   container `extas-pg-restore`. Check it: the last good orders are there, the bad change is not.
3. **Ask the owner** in the chat, in Bengali, with the facts: what happened, the restore minute, what is lost (orders
   placed after that minute must be re-entered from the order messages), how long the shop will be down (minutes).
   Wait for his written "OK".
4. **Replace the live database:** `mode = production`, the same `from` and `at`, `confirm = RESTORE`, and `owner_ok` =
   where his OK is (for example "chat, 2 Nov 14:05"). The workflow stops the shop, moves the live data aside to
   `data/postgres/pgdata.before-restore-<time>` (kept, never deleted), puts the restored copy in, ~~and starts the
   shop~~ brings it to the live version's schema with that version's migrate image (the deploy's own migrate step, R2 ops
   M3), and only then starts the shop. If that migration fails, or the run is cancelled or times out half way, the live
   database goes back and the shop starts again on it; the result says why (R2 ops M4).
5. **Run `deploy.yml`.** Its smoke test opens every page as a customer and as admin; a failure rolls back by itself.
6. **Product photos**, if they were damaged too: `extas-restore media --from blob` restores into a folder for checking;
   `--into live` copies only the missing photos back (it never overwrites or deletes). This one is not in the workflow
   yet: run it from the Azure portal's Run command after the owner's OK.
7. **Write it down:** `docs/reports/YYYY-MM-DD-incident.md` in simple Bengali — what happened, when, what was restored,
   what was lost, what stops it next time. Add a smoke check or a test for the cause in the fix PR (CN-016).

## 4. Rebuild on a fresh VM

> **বাংলায়:** সার্ভার হারালে নতুন সার্ভার বানিয়ে সব আবার বসানো হয়, তারপর লক করা ব্যাকআপ থেকে ডেটা ফেরানো হয়।

1. The owner creates a new VM with the same spec (CLAUDE.md "Infrastructure facts"; docs/owner/AZURE-VM-GUIDE.pdf) and
   installs the runner on it (docs/owner/RUNNER-SETUP.md). Remove the old runner from GitHub (Settings → Actions →
   Runners) so no job goes to the old machine. **Do not delete the old VM** until the owner says so; its disks are
   evidence.
2. Run `server-setup.yml` on the new VM (S0A): it installs everything, makes the disks, the database and the timers.
3. The owner types the Blob and Drive keys in again (*Keys & connections*), plus the Drive backup key from his vault copy.
4. §3 with `from = blob`, `mode = staging`, check, then — with his written OK — `mode = production`. The new server has
   no local backups, so `from = local` is not possible here.
5. Point Cloudflare at the new VM's address (PR 386, 362). Run `deploy.yml`; the smoke test must pass.

## 5. Practise it

- `extas-restore test` runs by itself every month (`extas-restore-test.timer`) and the result is on the status page.
- Once before go-live and then every three months: run §3 steps 1 and 2 (`test`, then `staging` from Blob) and write the
  result in `docs/reports/`. A restore nobody has practised is not a restore.
- After `BACKUP_IMMUTABLE="yes"`, the daily `lock-check` result is the proof that §1 still holds.
