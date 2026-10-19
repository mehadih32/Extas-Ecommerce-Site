# G05 · Writing an investigation report that names the responsible agent with evidence

*Gyani জ্ঞানী · A360-01 · executive module 5 of 5 · version 1.0 · as of October 2026*
*Method from Google SRE postmortems (blameless, reviewed, action items) and AWS Correction-of-Error (impact, timeline,
metrics, 5 whys, owned and dated actions), adapted: EXTAS also names the **owning agent and the failed control**.*

---

## 1. When to write one (triggers — decided in advance, like SRE)
- Sales emergency or a confirmed sales drop (G01 Step 0 signal).
- Any approval-list breach.
- Customer-visible error (wrong price, wrong courier entry, wrong SMS) affecting ≥ 1 order.
- Site downtime or checkout failure > 15 min.
- The owner asks "why".

## 2. Template (owner version in simple Bengali; English technical appendix)

```
তদন্ত রিপোর্ট #<n> · <তারিখ> · লিখেছে: জ্ঞানী (A360-01)

১. এক লাইনে: <কী হয়েছে, কত ক্ষতি>  e.g. "শুক্রবার ৬ ঘণ্টা চেকআউট বন্ধ ছিল — আনুমানিক ৪২টা অর্ডার হারিয়েছি (≈ ৳67,000)"
২. প্রভাব: অর্ডার/টাকা/কাস্টমার সংখ্যা · কখন থেকে কখন (সময় BST)
৩. সময়রেখা: hh:mm — কী ঘটেছে — প্রমাণ (log/screenshot/number)
৪. মূল কারণ (5 Whys): why1 → why2 → … → প্রক্রিয়ার কোন ফাঁক
৫. দায়িত্ব: কোন এজেন্টের এলাকা — <name · code>; কোন নিয়ম/চেক কাজ করেনি — <gate/rule/alert>;
   প্রমাণ ১: … প্রমাণ ২: …   (দুইটা স্বাধীন প্রমাণ ছাড়া "সম্ভাব্য" লিখবে)
৬. কী ঠিক করা হয়েছে (এখনই): …
৭. আর যেন না হয় (কাজ · মালিক এজেন্ট · শেষ তারিখ · অগ্রাধিকার):
   - …
৮. মালিকের সিদ্ধান্ত লাগবে: <থাকলে, অপশন + জ্ঞানীর সুপারিশ>
৯. শিক্ষা (lesson): <নতুন নিয়ম, কোন lessons ফাইলে যোগ হলো>
```

Technical appendix: metrics/graphs, queries used, commits/deploy IDs, platform screenshots, courier logs.

## 3. Naming the responsible agent — rules
1. Responsibility follows **ownership** (profiles: owned stages/PRs/files), not who was "closest".
2. Name the **control that failed** (missing test, missing alert, rule not followed, wrong data) — that's what gets fixed.
3. Evidence standard: two independent sources (e.g. deploy log + error spike; budget log + spend import). One source → "probable cause", investigation continues.
4. Distinguish: **cause** (what broke) vs **contributing** (what made it worse or slower to detect) vs **detection gap** (why nobody noticed sooner). AWS COE asks how to halve time-to-detect, time-to-diagnose and time-to-mitigate — answer all three.
5. Several agents can share responsibility (e.g. Sawdagor's price edit + Prohori's missing validation). Name each with its part.
6. If the root cause is the owner's own instruction or a missing owner decision, say so politely with the evidence and propose the decision needed.
7. Tone: factual, no blame words ("careless", "stupid"); SRE: avoid blame so issues keep being reported.

## 4. Review and close
- Draft → self-check (impact numbers sourced? timeline in BST? root cause deep enough — process level? every action has owner + date + priority?) → send to owner.
- "An unreviewed postmortem might as well never have existed" (Google SRE) → the owner (or Gyani's weekly review) closes it; actions tracked weekly until done.
- Store in the investigations folder; lessons added the same day; repeat-cause trend reviewed monthly.

## 5. Worked mini-example (illustrative)
> **১.** মঙ্গলবার বিকেল ৪টা থেকে রাত ১০টা পর্যন্ত মেটা বিজ্ঞাপন বন্ধ ছিল — অর্ডার ৩৮% কম (৬১ বনাম গড় ৯৮)।
> **৩.** 15:52 মেটা বিলিং: কার্ড ডিক্লাইন্ড (স্ক্রিনশট) · 16:00 থেকে স্পেন্ড ০ (স্পেন্ড ইমপোর্ট) · 21:40 মালিক নতুন কার্ড দিলেন।
> **৪.** কেন বন্ধ? কার্ড ডিক্লাইন্ড → কেন? মাসিক USD সীমা শেষ → কেন জানা ছিল না? খরচ বনাম কার্ড-সীমার কোনো অ্যালার্ট নেই → প্রক্রিয়ার ফাঁক: T08 নিয়ম "সিজনের আগে কার্ড সীমা যাচাই" স্বয়ংক্রিয় না।
> **৫.** দায়িত্ব: তীরন্দাজ (A360-07) — বাজেট/পেমেন্ট নজরদারি তার এলাকা (PR 265–268); ব্যর্থ নিয়ন্ত্রণ: কার্ড-সীমা অ্যালার্ট নেই। প্রমাণ: বিলিং নোটিস + স্পেন্ড ইমপোর্ট।
> **৭.** কার্ড-সীমার ৮০%-এ টেলিগ্রাম অ্যালার্ট · তীরন্দাজ + প্রহরী · ২৫ অক্টোবর · উচ্চ। দ্বিতীয় পেমেন্ট মাধ্যম ঠিক রাখা · মালিকের সিদ্ধান্ত।

---

**Sources** (type in brackets):
- [Book, official] Google SRE book, Postmortem culture: https://sre.google/sre-book/postmortem-culture/
- [Official vendor blog] AWS, Creating a correction of errors document: https://aws.amazon.com/blogs/mt/creating-a-correction-of-errors-document/
- [Official vendor doc] AWS, 5 Whys in incident reports: https://docs.aws.eu/AmazonCloudWatch/latest/monitoring/incident-report-5whys.html
- [Internal] agent profiles (ownership), APPRAISAL-TEMPLATE.md, skills/tirondaj/08-bangladesh-playbook.md

*As of October 2026.*
