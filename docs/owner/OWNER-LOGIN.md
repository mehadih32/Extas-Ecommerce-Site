# অ্যাডমিনে ঢোকার ই-মেইল আর প্রথম পাসওয়ার্ড কীভাবে দেখবেন

*২০ অক্টোবর ২০২৬ · CN-009 · PR 15*

আপনার দেওয়া ই-মেইল দিয়ে অ্যাডমিনের মালিক-অ্যাকাউন্ট খোলা হয়েছে। প্রথম পাসওয়ার্ডটা সার্ভারেই তৈরি হয়েছে, আর শুধু
সার্ভারেই থাকে। চ্যাটে, GitHub-এ বা কোনো ফাইলে আপনার ই-মেইল বা পাসওয়ার্ড কখনো লেখা হয় না। তাই আপনি নিজে
সার্ভার থেকে দেখে নেবেন।

## ধাপগুলো (২ মিনিট)
1. **portal.azure.com**-এ ঢুকুন।
2. উপরের সার্চে **Virtual machines** লিখুন, তারপর আপনার সার্ভারটা খুলুন।
3. বাম পাশের মেনুতে **Operations** → **Run command** চাপুন।
4. **RunShellScript** চাপুন।
5. বাক্সে শুধু এই লাইনটা লিখুন (কপি করে বসাতে পারেন):

   ```
   /usr/local/sbin/extas-owner-login
   ```

6. নিচে **Run** চাপুন। আধা মিনিট থেকে এক মিনিট লাগতে পারে।
7. **Output**-এ চারটা লাইন আসবে: অ্যাডমিনের ঠিকানা, আপনার ই-মেইল, প্রথম পাসওয়ার্ড, আর একটা মনে করিয়ে দেওয়া কথা।
8. ব্রাউজারে ওই ঠিকানাটা খুলুন। আগে কাজ দেখার পাসওয়ার্ড চাইবে (`PREVIEW-LOGIN.md`-এর নাম আর পাসওয়ার্ড)।
   তারপর অ্যাডমিনের পাতায় ই-মেইল আর প্রথম পাসওয়ার্ড বসান।

## প্রথমবার ঢুকেই পাসওয়ার্ড বদলান
- প্রথম পাসওয়ার্ডটা শুধু একবার ঢোকার জন্য। ঢোকার পরই অ্যাডমিন আপনাকে নতুন পাসওয়ার্ড দিতে বলবে।
- নিজের একটা শক্ত পাসওয়ার্ড দিন, যেটা শুধু আপনি জানেন। এরপর পুরনো প্রথম পাসওয়ার্ড আর কাজ করবে না।

## ঢুকতে না পারলে (পাসওয়ার্ড ভুলে গেলে বা বারবার ভুল হলে)
- আমাকে চ্যাটে শুধু বলুন "অ্যাডমিনে ঢুকতে পারছি না"। আমি সার্ভারে আপনার অ্যাকাউন্টের জন্য নতুন একটা প্রথম পাসওয়ার্ড বানিয়ে দেব।
- তারপর উপরের ৫ নম্বর ধাপের একই লাইনটা (`/usr/local/sbin/extas-owner-login`) আবার চালান। নতুন প্রথম পাসওয়ার্ডটা দেখাবে।
- সেটা দিয়ে ঢুকুন, আর ঢুকেই নিজের নতুন পাসওয়ার্ড দিন। পুরনো পাসওয়ার্ড তখন আর কাজ করবে না।
- ই-মেইলের ঘরে সবসময় পুরো ঠিকানা লিখবেন (যেমন নাম@gmail.com)। শুধু "admin" লিখলে হবে না।

## জানার কথা
- পাসওয়ার্ডটা কাউকে মেসেজে পাঠাবেন না।
- `Output`-এ যদি লেখা আসে "মালিক-অ্যাকাউন্ট এখনো খোলা হয়নি", তাহলে আমাকে বলুন। আবার চালানো নিরাপদ: একবার অ্যাকাউন্ট
  খোলা হয়ে গেলে আর নতুন করে খোলে না, কিছু বদলায়ও না।
- আরও কাউকে অ্যাডমিনে ঢোকাতে চাইলে নিজে অ্যাডমিন থেকে যোগ করবেন। তার জন্য এই ধাপ লাগবে না।
- এই অ্যাকাউন্ট শুধু নতুন সাইটের (new.extas.com.bd) জন্য। পুরনো দোকান extas.com.bd-এর সাথে এর কোনো সম্পর্ক নেই।

---
*For agents:* when the owner cannot sign in, run `.github/workflows/owner-reset.yml` (workflow_dispatch, no input):
`extas-owner-reset` gives the one owner account a new first password into the same `owner-login.env`, ends its
sessions and lifts a wrong-try wait; its report `docs/reports/server/owner-reset.md` says why sign-ins failed (counts
only). The first account: run `.github/workflows/owner-account.yml` (workflow_dispatch, input `owner_email`, optional `owner_name`).
The e-mail and the first password live only in `/srv/extas/config/secrets/owner-login.env` (0600) on the VM; the
workflow's report is `docs/reports/server/owner-account.md` (result only). Never put the e-mail or the password in a
workflow input expression, a log, an artifact, a commit, a report or chat. A second run refuses (exit 3) and changes
nothing.
