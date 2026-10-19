# সার্ভারে GitHub রানার বসানো — একবার, ৫ মিনিট

**কেন:** Claude-এর ক্লাউড থেকে আপনার সার্ভারে সরাসরি ঢোকা (SSH, পোর্ট 22) বন্ধ। তাই সার্ভারে একটা ছোট "রানার" বসবে — সার্ভার নিজেই GitHub থেকে কাজ নিয়ে এসে করবে। **কোনো key বা পাসওয়ার্ড কাউকে পাঠাতে হবে না।**

## ধাপ ১ — GitHub থেকে টোকেন নিন
1. github.com → রিপো **Extas-Ecommerce-Site** খুলুন
2. উপরে **Settings** → বাম মেনু **Actions → Runners**
3. সবুজ বাটন **New self-hosted runner** → **Linux**, Architecture **x64**
4. নিচে "Configure" অংশে একটা লাইন আছে: `./config.sh --url ... --token ABCD...`
   → **`--token`-এর পরের লম্বা লেখাটা** কপি করুন (১ ঘণ্টা কাজ করে)। কাউকে পাঠাবেন না।

## ধাপ ২ — Azure-এ বসান
1. portal.azure.com → VM **Extas-Ecommerce-Site** খুলুন
2. বাম মেনু **Operations → Run command** → **RunShellScript**
3. নিচের পুরো লেখাটা পেস্ট করুন (`infra/bootstrap/install-runner.sh`; এতে `set -eu` আছে, কারণ Azure Run command সাধারণ sh দিয়ে চালায় — `pipefail` চলে না)। **শুধু `PASTE_TOKEN_HERE` জায়গায় ধাপ ১-এর টোকেন বসান** (উদ্ধৃতি চিহ্ন " " থাকবে)
4. **Run** চাপুন। ২–৫ মিনিট পর নিচে লেখা আসবে: `DONE: EXTAS runner installed and running`

(স্ক্রিপ্ট: `infra/bootstrap/install-runner.sh` — একই লেখা)

## ধাপ ৩ — মিলিয়ে দেখুন
GitHub → Settings → Actions → Runners-এ **extas-vm** নামে একটা রানার **Idle** (সবুজ) দেখাবে। ব্যস — আর কিছু করতে হবে না।

**নিরাপত্তা:** রানার শুধু আপনার private রিপোর কাজ করে। রিপো কখনো public করবেন না।
