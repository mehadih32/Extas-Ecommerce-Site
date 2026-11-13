# নিয়ম (সব নিয়ম এক পাতায়)

## এটা কী
দোকানের প্রতিটা নিয়ম এক লাইনের বাক্যে, এক পাতায়: ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারির সীমা, অগ্রিম, ডুপ্লিকেট অর্ডার, অর্ডার মার্জ,
দাম কমানোর সীমা, কুরিয়ার, এক্সচেঞ্জ, ব্যস্ত সময় আর ঈদ মোড, অফার আর পপ-আপ। প্রতিটা সারিতে নিয়মের অবস্থা (চালু, বন্ধ বা
নমুনা) দেখায়। **Edit** চাপলে ডান পাশে (ফোনে নিচে) সম্পাদনার ঘর খোলে, পাতা ছেড়ে যেতে হয় না। লম্বা নিয়ম লেখার পাতা
আলাদা: **Smart Rules**।

## কেন দরকার
আগে একই কাজের নিয়ম দশটা পাতায় ছড়ানো ছিল, তাই কোনটা চালু আর কোনটা শুরুর সংখ্যায় পড়ে আছে বোঝা যেত না। এখন এক
নজরে দেখা যায়, আর বদলালে নতুন অর্ডার থেকেই দোকান সেটা মানে।

> [!NOTE]
> ধরুন একই কাস্টমার তিন দিনের মধ্যে আবার একই জিনিস অর্ডার করে ফেলেন। **Order flow** গ্রুপে **Duplicate orders** সারির **Edit**
> চাপুন। **Look back (days)** এখন 5, সেটা দেখে নিন। **Put a clear duplicate on hold by itself** চালু করে **Save** চাপুন: পরের
> ডুপ্লিকেট নিজে থেকে হোল্ডে যাবে আর আপনি দেখে ছাড়বেন।

## কীভাবে করবেন
1. মেনুতে **Rules** → **All rules** খুলুন।
2. বাঁ পাশের গ্রুপ থেকে ভাগ বাছুন (ডেলিভারি, পেমেন্ট ও COD, অর্ডার ফ্লো …), অথবা উপরের খোঁজার ঘরে লিখুন।
3. যে সারি বদলাবেন তার **Edit** চাপুন।
4. ঘরগুলোতে নতুন মান দিন। নিচে **What changes** দেখায় আগে কী ছিল আর এখন কী হবে।
5. টাকা বা দামের নিয়ম হলে **Owner's PIN** দিয়ে **Save with PIN** চাপুন; অন্যগুলোয় **Save**।
6. শুরুর মানে ফিরতে **Back to the starting value**।

## প্রতিটা বোতাম আর ঘরের মানে
- **All rules** আর **Delivery · Payment & COD · Checkout & payments · Order flow · Courier · Courier messages · Exchange · Customers · Discounts · Messages** — নিয়মের ভাগ। বাঁ পাশে।
- **Search rules, e.g. COD, exchange, free delivery** — খোঁজার ঘর।
- **Edit** — সারির সম্পাদনার ঘর খোলে। **Open** — যে নিয়ম অন্য পাতায় থাকে (অফার, পপ-আপ, কুরিয়ার) সেই পাতা খোলে।
- **On · Off · Sample** — অবস্থা। **Sample** মানে নিয়ম চালু আছে কিন্তু দোকানের শুরুর সংখ্যায়; দেখে নিয়ে সেভ করলে সেটা আপনার হয়।
- **Show all** — নমুনা ছাড়া সব সারি ফিরিয়ে আনে।
- **Free delivery from (amount)** — কত টাকা থেকে ডেলিভারি ফ্রি। টাকার নিয়ম, তাই মালিকের OK আর PIN।
- **Switch Peak and Eid mode on** — ব্যস্ত সময় আর ঈদ মোড। **Orders a day the shop can send** — দিনে কয়টা অর্ডার পাঠানো যাবে; দিন ভরে গেলে
  **Words when the day is full (English)** আর **Words when the day is full (Bengali)** দেখায়। **Stickers in one part of Print all in parts** —
  প্রিন্টে এক ভাগে কয়টা স্টিকার। **Roster for the busy days** — **Name**, **Task**, **First day**, **Last day**, **Add a person**, **Remove**।
- **Let rules confirm orders** — নিয়ম নিজে অর্ডার কনফার্ম করে। **Delivered parcels that make a customer trusted** আর
  **Most refusals a trusted customer may have** — কাকে বিশ্বস্ত ধরা হবে।
- **Look for duplicate orders** — **Look back (days)** (শুরুতে 5) আর **Put a clear duplicate on hold by itself**।
- **Allow merging orders** — **Look back (days)**, **Merge by itself when the addresses match**, **When the addresses differ** (**ask a person** বা **do not merge**)।
- **Allow price adjust on open orders** — **Limits by role**: ভূমিকা টিক দিলে তার নিজের সীমা, কত টাকা আর কত শতাংশ; খালি ঘর মানে ওই দিকে সীমা নেই;
  টিক না দেওয়া ভূমিকা প্রতিবার মালিককে জিজ্ঞেস করে। টাকার নিয়ম, তাই মালিকের OK আর PIN।
- **Hours before the advance reminder** — অগ্রিমের রিমাইন্ডার কত ঘণ্টা পর (0 = নেই)। **Days to check a returned piece** — ফেরত পিস ERP-তে চেকের দিন।
- **Allow replacement** — **Hours after delivery it can be opened** আর **Days for the old piece to come back**।
- **What changes** — সেভের আগে বদলের তালিকা। **Back to the starting value** — শুরুর মানে ফেরা। **Owner's PIN** আর **Save with PIN** — টাকার নিয়মে।
- **Save** আর **Cancel** — সেভ বা বাতিল। **Close** — ঘর বন্ধ।

## সাধারণ ভুল
- **নমুনা সংখ্যা না দেখে ছেড়ে দেওয়া।** **Sample** সারিগুলো দোকানের নিজের শুরুর সংখ্যায় চলছে; আপনার ব্যবসার সংখ্যা বসিয়ে সেভ করুন।
- **টাকার নিয়মে PIN ভুলে যাওয়া।** PIN ছাড়া ফ্রি ডেলিভারি, দাম কমানো বা অফার সেভ হয় না; এটা ইচ্ছা করেই।
- **সব ঘর খালি রেখে ভাবা সীমা শূন্য।** খালি মানে "সীমা নেই" বা "বন্ধ", শূন্য নয়।
- **পুরনো অর্ডারেও বদলাবে ভাবা।** বদল শুধু নতুন অর্ডারে খাটে।

> [!TIP]
> কুরিয়ারকে পাঠানো লেখা (বুকিং, বাতিল, ক্লেইম) এই পাতায় নেই, **Courier messages** সারির **Open** দিয়ে কুরিয়ারের পাতায় যান।

## এরপর কী হয়
সেভের পর নতুন অর্ডার থেকেই নিয়ম খাটে; কে কখন কী বদলেছে নিয়মের ইতিহাসে লেখা থাকে। টাকার নিয়ম মালিকের OK আর PIN ছাড়া বদলায়
না। অফার, পপ-আপ আর স্মার্ট নিয়মের পাতা আলাদা, কিন্তু অবস্থা এখানেও দেখায়।
