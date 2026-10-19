# সার্ভার — সহজ ভাষায় (PR 10 রানবুক)

এই ফাইলটা আপনার জন্য। আপনাকে নিজে কিছু চালাতে হবে না। সব কাজ GitHub থেকে নিজে নিজে সার্ভারে চলে।

## সার্ভারে কী আছে

| জিনিস | কী করে | কোথায় থাকে |
|---|---|---|
| ডাটাবেস (PostgreSQL) | অর্ডার, পণ্য, কাস্টমার সব তথ্য | ১ টিবি স্থায়ী ডিস্কে |
| PgBouncer | ডাটাবেসে ভিড় সামলায় | — |
| Redis (২টা) | একটা দ্রুত ক্যাশ, আরেকটা কাজের সারি | ক্যাশ NVMe-তে, সারি স্থায়ী ডিস্কে |
| Meilisearch | সাইটের সার্চ (বাংলা ও ইংরেজি) | স্থায়ী ডিস্কে |
| Caddy | সাইটের দরজা: HTTPS, পাসওয়ার্ড, দ্রুত লোড | — |
| ব্যাকআপ | প্রতিদিন রাত ২:৩০-এ পুরো ব্যাকআপ, প্রতি মিনিটে ছোট ব্যাকআপ | স্থায়ী ডিস্ক + Azure Blob + Google Drive |
| পাহারা (মনিটর) | প্রতি মিনিটে সব ঠিক আছে কিনা দেখে | — |

## ডিস্ক তিন রকম

- **স্থায়ী ডিস্ক (১ টিবি):** আসল সব তথ্য। কখনো মোছে না।
- **NVMe (৪৪০ জিবি):** খুব দ্রুত, কিন্তু সার্ভার বন্ধ করলে মুছে যায়। তাই এখানে শুধু অস্থায়ী কাজ হয়। প্রতিবার চালু হলে সার্ভার নিজেই এটা আবার তৈরি করে নেয়।
- **Azure Blob:** সব ছবি আর ব্যাকআপের কপি।

## সার্ভার রিস্টার্ট হলে

সব নিজে নিজে ঠিক ক্রমে চালু হয়: আগে NVMe, তারপর স্থায়ী ডিস্ক, তারপর ডাটাবেস আর বাকি সব। আপনাকে কিছু করতে হবে না।

## RAM আর CPU-র ভাগ

একটা কনফিগ ফাইলে লেখা থাকে (`infra/config/server.conf`)। সার্ভার নিজের CPU আর RAM মেপে হিসাব করে নেয়। ছোট সার্ভারে গেলেও হাতে কিছু বদলাতে হয় না।

## সতর্কবার্তা

ডিস্ক ৮০% ভরলে, কোনো সার্ভিস বন্ধ হলে, ব্যাকআপ ব্যর্থ হলে, সাইট ধীর হলে বা NVMe না পেলে টেলিগ্রামে বার্তা যাবে। টেলিগ্রাম বট যোগ না হওয়া পর্যন্ত বার্তাগুলো সার্ভারের লগে জমা থাকে।

## ব্যাকআপ ফেরানো

এক কমান্ডে হয়, আর প্রতি মাসের ১ তারিখে সার্ভার নিজেই পরীক্ষা করে দেখে ব্যাকআপ সত্যিই ফেরানো যায় কিনা। আসল সাইটে ফেরানোর আগে সবসময় আলাদা কপিতে পরীক্ষা হয়, আর `RESTORE` লিখে নিশ্চিত করতে হয়। পুরনো তথ্য কখনো মোছা হয় না।

## অবস্থা কোথায় দেখবেন

- **new.extas.com.bd**-এর অগ্রগতি পাতায়।
- প্রতিবার সেটআপ চললে সার্ভার একটা ছোট রিপোর্ট লেখে: `docs/reports/server/latest.md`।

---

*For agents:* the code is `infra/server/setup.sh` (steps in `infra/server/steps/`, order A2.9.16), run by
`.github/workflows/server-setup.yml` on the runner `extas-vm`. Helpers installed on the VM: `extas-nvme-prepare`,
`extas-profile`, `extas-backup daily|wal|prune`, `extas-restore test | --from local|blob|drive --at "…" --target staging|production`,
`extas-monitor` (state in `/srv/extas/state/health.json`). Secrets live only in `/srv/extas/config/secrets` (mode 600).
Deploy (`.github/workflows/deploy.yml` → `infra/deploy/deploy.sh <app-image> <migrate-image>`): the migrate image
(`apps/web/Dockerfile --target migrate`) first runs `prisma migrate deploy` and the settings sync (PR 496) on the
`extas` network with `DATABASE_DIRECT_URL`; only then does the new colour start. A failed migration stops the deploy
with the live colour untouched. The app reads `DATABASE_URL` (PgBouncer, transaction pool) and `DATABASE_DIRECT_URL`
from `secrets/app.env`, written by `steps/09-stack.sh` from the generated Postgres password.
