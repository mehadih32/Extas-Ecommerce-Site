# new.extas.com.bd-এর পাসওয়ার্ড কীভাবে দেখবেন

*২০ অক্টোবর ২০২৬ · CN-007*

কাজ দেখার ঠিকানা **new.extas.com.bd** পাসওয়ার্ড দিয়ে বন্ধ। পাসওয়ার্ডটা শুধু আপনার সার্ভারে থাকে।
চ্যাটে, GitHub-এ বা কোনো ফাইলে এটা কখনো লেখা হয় না। তাই আপনি নিজে সার্ভার থেকে দেখে নেবেন। একবার দেখলেই হবে।

## ধাপগুলো (২ মিনিট)
1. **portal.azure.com**-এ ঢুকুন।
2. উপরের সার্চে **Virtual machines** লিখুন, তারপর আপনার সার্ভারটা খুলুন।
3. বাম পাশের মেনুতে **Operations** → **Run command** চাপুন।
4. **RunShellScript** চাপুন।
5. বাক্সে শুধু এই লাইনটা লিখুন (কপি করে বসাতে পারেন):

   ```
   /usr/local/sbin/extas-preview-login
   ```

6. নিচে **Run** চাপুন। আধা মিনিট থেকে এক মিনিট লাগতে পারে।
7. **Output**-এ তিনটা লাইন আসবে: ঠিকানা, নাম আর পাসওয়ার্ড।
8. ব্রাউজারে **new.extas.com.bd** খুলুন। নাম আর পাসওয়ার্ড চাইলে ওই দুইটা বসান। ব্রাউজারকে মনে রাখতে বলুন, পরে আর লাগবে না।

## জানার কথা
- পাসওয়ার্ডটা কাউকে মেসেজে পাঠাবেন না। অন্য কাউকে দেখাতে চাইলে তাকেও এই ধাপগুলো দিন।
- পাসওয়ার্ড বদলাতে চাইলে আমাকে শুধু বলুন "পাসওয়ার্ড বদলাও"। নতুনটা আবার এই একই ধাপে দেখবেন।
- এই পাসওয়ার্ড শুধু কাজ দেখার জন্য। দোকানের আসল সাইট extas.com.bd-এর সাথে এর কোনো সম্পর্ক নেই।

---
*For agents:* the password lives only in `/srv/extas/config/secrets/staging.env` on the VM. Rotate it with the
`server-setup` workflow, input `rotate_staging_password: true` (and `only: stack`). Never print it in a workflow log,
an artifact, a commit, a report or chat.
