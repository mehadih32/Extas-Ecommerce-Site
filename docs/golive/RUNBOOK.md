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
- [ ] **Rehearsal on staging:** run the deploy workflow with "Go back to the previous version" (rollback) once, check
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
| 7 | The smoke test runs against the main domain (Actions → Smoke test); it must pass (CN-016). | See section 2. |
| 8 | One real cash-on-delivery order by the team, then cancelled in the admin (no money moves). Then Website → SEO → let search engines in, and in Search Console verify the main domain and submit `/sitemap.xml` (PR 401; go-live lines "Main domain open to search engines" and "Search Console on the main domain"). Now add the main domain to Keys & connections → Cloudflare and press **Send to Cloudflare** (Settings → Sign-in & security → Cloudflare protection); before this step it refuses the main domain, which was still the old shop (PR 386). | Switch search engines off again (the main domain then answers `noindex`). |
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
   production with the typed confirmation and the PIN (PR 396). The old database is kept on the server. This is the
   last step and is never needed for a domain problem.

After any rollback: the cause becomes a fix PR with a smoke check for it (CN-016), and the switch is tried again only
with the owner's new go-ahead.

## 3. What never happens
- The old WordPress shop and its hosting are not removed: they stay until the owner decides separately (keeping them a
  few weeks after go-live is the safe default, and the redirects stay at least 12 months, PR 587).
- No order, customer or payment record is deleted on either side (hard rule 3).
- No money is moved, no price, discount or COD rule changed as part of the switch (hard rule 6).
- Keys are never pasted into chat, logs or this file (hard rule 2).

## 4. Owner's part
- The go-ahead for the day and the quiet hour (the only decision).
- If the Cloudflare account is his alone: the DNS change of step 5 (and its undo), with the team on the phone.
- Checking his own data on the live site (legal numbers, contacts, charges — PR 399).
