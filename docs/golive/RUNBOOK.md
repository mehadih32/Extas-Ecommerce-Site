# Go-live runbook and rollback plan (PR 398)

S19 · PR 398 (CN-031, Blueprint A1.5). How the main domain (extas.com.bd) moves from the old WordPress shop to the new
site, minute by minute, and how each step is undone. The switch itself is the owner's decision (CLAUDE.md: the go-live
switch of extas.com.bd is one of the only real stops); nothing in this file runs on its own. The redirects of the old
addresses are PR 587, the preview password and `noindex` on the main domain PR 403, Search Console PR 401, the first
week PR 402.

> **বাংলা সারকথা:** মূল ডোমেইন (extas.com.bd) পুরনো WordPress দোকান থেকে নতুন সাইটে নেওয়ার ধাপগুলো এখানে, প্রতিটা ধাপ
> কীভাবে ফেরানো যায় তাও। ডোমেইন বদলানো শুধু মালিকের হ্যাঁ বলার পরে হয়। কিছু ভুল হলে প্রথমে নতুন সাইটের আগের ভার্সনে ফেরা হয়
> (এক ধাপ); তাতেও না হলে ডোমেইন আবার পুরনো দোকানে ফেরানো হয় — কোনো অর্ডার বা ডেটা মোছা হয় না। পুরনো দোকান বন্ধ হয় শুধু
> মালিকের আলাদা সিদ্ধান্তে। এই ফাইল পড়া আর staging-এ ফেরানোর মহড়া হলে "চালুর আগে" পাতায় "রানবুক আর ফেরানোর মহড়া" নিশ্চিত করুন।

## 0. Before the day (any time in the last week)
- [ ] **Settings → System → Go-live** shows every line done except this runbook's own sign-off and the owner's steps.
- [ ] The main domain's DNS is already on Cloudflare (its name servers moved days earlier, records still pointing at the
      old WordPress host, so visitors notice nothing). A name-server move can take up to two days; it is never done on the day.
- [ ] Export the zone's DNS records (Cloudflare → the domain → DNS → Records → Export) and keep the file with the
      owner's papers, **outside Git** (it is owner data, hard rule 4). It is the record of where the old shop lives.
- [ ] The Cloudflare Origin certificate covers the main domain (`extas.com.bd` and `*.extas.com.bd`; go-live line
      "Cloudflare Origin certificate on the server") and SSL/TLS is Full (strict) (PR 397).
- [ ] The main domain is added to the store as its primary domain (Settings → Stores, PR 362), so the shop builds its
      addresses, sitemap and canonical links on it.
- [ ] The redirect map of every old WordPress address to its new page is loaded and checked on staging (PR 587).
- [ ] **Search Console domain property prepared** (PR 233 follow-up, CN-036; it changes nothing the old shop shows):
      1. the owner, in Google Search Console → Add property → **Domain** → the main domain, copies the TXT record Google shows;
      2. **the owner** adds that TXT record in the main domain's DNS (Cloudflare → the domain → DNS → Add record, type TXT,
         name `@`) and presses Verify in Search Console — the old WordPress shop keeps working, a TXT record moves no visitor;
      3. in Search Console → Settings → Users and permissions, the service account's e-mail (Keys & connections → Search
         Console) is added as **Full** user;
      4. Keys & connections → Search Console: the key is pasted and **Test** passes (until then the row stays on its mock).
      The property is `sc-domain:<main domain>`; Website → SEO → "Send the sitemap" finds it by itself (`propertyFor`,
      lib/seo/verification.ts) and is pressed only in step 8 of the day, once the shop answers on the main domain.
      Owner's line (বাংলা): **Search Console-এ "Domain" প্রপার্টি খুলে Google যে TXT রেকর্ড দেয়, সেটা Cloudflare-এর DNS-এ (টাইপ TXT, নাম @) বসিয়ে Verify চাপুন — পুরনো সাইটে কিছু বদলাবে না।**
- [x] **Rehearsal on staging** (done 6 Nov 2026, 11 min 38 s; section 5)**:** run the deploy workflow with "Go back to the previous version" (rollback) once, check
      new.extas.com.bd works on the older version, then run it again without the box to come back. Write the time it took.
- [ ] Agree a quiet hour with the owner (few orders on the old shop) and who watches the shop during it.

## 1. On the day — the switch (about 30 minutes)
| Step | What | How to undo it |
|---|---|---|
| 1 | Nobody merges into `main` until step 8 is done (a deploy in the middle would mix two changes). | — |
| 2 | **Settings → System → Backups → Back up now**; wait for "done" on every copy (PR 507). | — |
| 3 | Write down the old shop's last order number (WordPress admin), so orders on either side can be matched later. | — |
| 4 | Server: the main domain is added to Caddy's sites beside new.extas.com.bd, with the preview password and `noindex` only on the staging host (PR 403): in `infra/config/server.conf` the main domain goes into `EXTAS_EXTRA_HOSTS` and, with the owner's OK for this day (BLOCKED 25), `EXTAS_MAIN_OPEN="yes"`; the push re-runs server setup, which must show every step OK and the line "PR 403 · main domain: open". `curl -sI https://new.extas.com.bd` still answers 401 with `X-Robots-Tag: noindex`. | `EXTAS_MAIN_OPEN="no"` locks the main domain again; or run setup again without the main domain. |
| 5 | Cloudflare → DNS: the main domain's A/AAAA (or CNAME) records point at the VM, **proxied** (orange cloud). With Cloudflare in front the change reaches visitors within a minute or two. | Put the exported records back (step 0) — the old shop answers again. |
| 6 | Open `https://extas.com.bd` on a phone and a desktop: home, a category, a product, the bag, checkout; an old address redirects to its new page (PR 587). | Steps 5 and 4 back. |
| 7 | The smoke test runs against the main domain (Actions → Smoke test → Run workflow, host `main`); it must pass (CN-016). | See section 2. |
| 8 | One real cash-on-delivery order by the team, then cancelled in the admin (no money moves). Then **the indexing switch, one step** (PR 401 follow-up, CN-036): Website → SEO → Search engines → **let search engines in** (`seo.indexing.searchEngines` on; the page list under it stays as it is, so it is the admin switch, not a settings run that would rewrite the whole object). It opens only the store's primary domain: new.extas.com.bd stays closed (Caddy's `noindex` and password, and the app's own rule that only the primary domain is ever open). Check: `curl -s https://<main domain>/robots.txt` shows `Allow: /` and the sitemap line. Then press Website → SEO → **Send the sitemap** (the domain property prepared in section 0) (PR 401; go-live lines "Main domain open to search engines" and "Search Console on the main domain"). Now add the main domain to Keys & connections → Cloudflare and press **Send to Cloudflare** (Settings → Sign-in & security → Cloudflare protection); before this step it refuses the main domain, which was still the old shop (PR 386). | Switch search engines off again (the main domain then answers `noindex`). |
| 9 | Merges may start again. **Settings → System → Go-live → Start the first week** (PR 402): a daily check on Telegram and the smoke test of every page every few hours, for the days of `golive.firstWeek`. | Stop it on the same card. |

## 2. When something goes wrong — rollback, smallest step first
Decide within **30 minutes** of the problem being seen; a slow decision costs more orders than a quick rollback.

1. **A new version broke something** (a page errors, checkout fails after a deploy): the deploy's own smoke test rolls
   back by itself (CN-016). If it did not: Actions → **Deploy** → Run workflow → tick **"Go back to the previous
   version"**. One step, no data touched, no down-migration (PR 4 / 17).
2. **The new site itself is not ready on the main domain** (the rollback above does not help, the certificate fails
   with error 526, payments or couriers misbehave): put the main domain's DNS records back to the exported ones (step 5,
   undo). The old WordPress shop answers again within minutes. The new site stays on new.extas.com.bd; the orders it
   took in between stay in its database and are handled from its admin — nothing is lost or deleted.
3. **Data is wrong** (only this needs a restore): Settings → System → Backups → restore to the check copy first, then
   production with the typed confirmation and the PIN (PR 396). The old database is kept on the server, and the
   restored one is migrated to the live version's schema before the shop starts again (R2 ops M3). This is the
   last step and is never needed for a domain problem.

After any rollback: the cause becomes a fix PR with a smoke check for it (CN-016), and the switch is tried again only
with the owner's new go-ahead.

## 3. What never happens
- The old WordPress shop and its hosting are not removed: they stay until the owner decides separately (keeping them a
  few weeks after go-live is the safe default, and the redirects stay at least 12 months, PR 587).
- No order, customer or payment record is deleted on either side (hard rule 3).
- No money is moved, no price, discount or COD rule changed as part of the switch (hard rule 6).
- Keys are never pasted into chat, logs or this file (hard rule 2).

## 4. PR 587 — prepared up to the owner's "go live" (CN-035)
Everything below is ready and has been run only in its read-only or dry-run form. Nothing here switches the main
domain until the owner says "go live" (CLAUDE.md).

1. **The go-live check** (any time; read-only): Actions → **golive-check** → Run workflow, `domain` = the main domain.
   It reads the go-live list on staging (every "Needed before go-live" row and its state), the WordPress redirect map
   (rows, live or not, every target opens with 200 and never forwards again) and the sitemap (every address's path
   opens on staging), and validates the main domain's Caddy block, **open**, in a copy inside the Caddy container.
   Report: `docs/reports/golive/latest/README.md`. It never asks the main domain and changes nothing.
2. **The redirect map** (before the day; PR 653): Actions → **redirect-import** → Run workflow, `old_site` = the main
   domain. It GETs only the old shop's public sitemap files (47 page addresses on 6 Nov 2026; 49 counted on 19 Oct in
   docs/owner/GOOGLE-TRAFFIC-PLAN.md §1.6 F1) and matches each to its new page; without `commit` it is a dry run, with
   `commit` the rows are written (source `wordpress`). Every address keeps a page: one without a twin goes to its nearest
   category or the home page and is listed in `docs/reports/redirect-import/latest/README.md` for the owner to change in
   Website → SEO → Redirects. Run it again after products are added or renamed (the same rows are updated, never
   doubled). By hand instead: Website → SEO → Redirects → Import, kind **WordPress**; the check first, then "Write". The rows stay off until go-live day: `seo.redirects.wordpressMapLive` is switched on in
   step 6 of the day. Keep them at least 12 months.
3. **The server half of the switch** (runbook step 4), staged, NOT run:
   `node tools/golive-switch.mjs --domain <main domain>` shows the two server.conf lines it will write
   (`EXTAS_EXTRA_HOSTS` = the main domain and `www.`, `EXTAS_MAIN_OPEN="yes"`) and writes nothing. Only on the owner's
   own "go live" it runs again with the typed confirmation `--confirm "GO LIVE <main domain>"`; then commit
   `PR 587: go live — <main domain>` and push: server setup re-runs and must show "PR 403 · main domain: open", while
   new.extas.com.bd keeps its password and `noindex` (its own block, always). Undo: `--undo --confirm "UNDO <main domain>"`.
4. **The day**, in the order of section 1: step 2 (backup), step 3, step 4 (the command above), step 5 (DNS, the
   owner's account), step 6 with the WordPress map switched on and a crawl of the old addresses, step 7
   (Actions → smoke, host `main`), steps 8 and 9.

## 5. Rehearsal record (PR 398)
The rollback rehearsal of section 0 on staging, run by the build (Actions → Deploy, "Go back to the previous version",
then a normal run). Seen in it and fixed: the rollback's deploy report said the docs copy's record was missing (PR 594
follow-up). The smoke test runs only after a deploy forward; on the way back the health check proves the older version
answers. The go-live page's "Go-live runbook read, rollback rehearsed" is still pressed by a person after
reading this file.

| Date | Back one version | Forward again | Total | Staging after each | Runs |
|---|---|---|---|---|---|
| 2026-11-06 06:33 (Asia/Dhaka) | `b5bbe1ad07ce` → `419e6d86338a`: 43 s from the press to the older version answering (the switch itself 33 s; no build, no migration) | → `0dd2bba855de` (main, the same code as `b5bbe1ad07ce`): 3 min 31 s to the new version answering (build 2 min 35 s, migration and switch 44 s), then the smoke test 6 min 41 s | 11 min 38 s | health check HTTP 200 on the older version (blue); smoke test PASS, 408 page views, 0 failed, on the newer one (green); no moment without a live version (blue/green) | [back](https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/42137694308), [forward](https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/42137851514) |

## 6. Owner's part
- The go-ahead for the day and the quiet hour (the only decision).
- If the Cloudflare account is his alone: the DNS change of step 5 (and its undo), with the team on the phone.
- Checking his own data on the live site (legal numbers, contacts, charges — PR 399).
