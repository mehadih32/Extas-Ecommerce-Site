/* =====================================================================
   73-blog.js — শিল্পী Shilpi A360-05 · customer-facing blog ("Journal")
   S12 PR 239–253 · PR 591 (3–6 posts a day) · PR 592 (complete blog + house ads)
   ---------------------------------------------------------------------
   Routes (all under page name 'journal', so the header WhatsApp switch and
   the analytics page name keep working):
     #/journal                         blog home: featured, category chips, search, grid, load more
     #/journal/<slug>                  post page (template below)
     #/journal/topic/<pillar>[/<sub>]  category (pillar) and sub-category pages
     #/journal/tag/<tag>               tag page
     #/journal/author/<id>             author / reviewer page
     #/journal/archive[/<yyyy-mm>]     archive by month
     #/journal/search?q=               search results (noindex in the live build)
     #/journal/rss                     RSS placeholder (live: /journal/rss.xml)
     #/bn/journal…                     the same pages in Bengali (/bn/ in the live build)
   Data: published posts come from the Blog admin store (94-admin-blog.js:
   zb_posts(), the same list zb_apply() writes into DB.journal). The demo
   guides below (BF_DEMO, marked "Demo") are merged in by slug; an admin post
   with the same slug that the owner has edited wins; an unpublished one hides
   the demo too. House ads read ST.blogAds / ST.blogAdSettings (contract shared
   with Gyani's backend) and fall back to BLOG_ADS_SEED.
   Prefix bf_. This file only ADDS: it redefines PAGES.journal and puts one
   route at the front of ROUTES. Nothing else is changed.
   ===================================================================== */

/* ---------- pillars (categories) and sub-categories ---------- */
var BF_PILLARS = [
  {id:'care', en:'Care & washing', bn:'যত্ন ও ধোয়া', ico:'swap',
   intro:'How to wash, dry, iron and store menswear so it lasts — written for Bangladesh heat, humidity and monsoon.',
   introBn:'বাংলাদেশের গরম, আর্দ্রতা আর বর্ষার কথা মাথায় রেখে — কাপড় ধোয়া, শুকানো, ইস্ত্রি আর গুছিয়ে রাখার সহজ নিয়ম।',
   subs:[['washing','Washing','ধোয়া'],['storage','Storage & folding','রাখা ও ভাঁজ']], shop:['polos','Polos','পোলো']},
  {id:'style', en:'Styling', bn:'স্টাইলিং', ico:'spark',
   intro:'Outfit ideas for the office, weekends and family events, built from pieces most men already own.',
   introBn:'অফিস, ছুটির দিন আর পারিবারিক অনুষ্ঠানের জন্য সাজের আইডিয়া — হাতের কাপড় দিয়েই।',
   subs:[['office','Office','অফিস'],['casual','Casual','ক্যাজুয়াল']], shop:['shirts','Shirts','শার্ট']},
  {id:'fabric', en:'Fabrics', bn:'কাপড়', ico:'layers',
   intro:'Piqué, jersey, Oxford, linen and GSM explained in plain words, so you can judge quality before you buy.',
   introBn:'পিকে, জার্সি, অক্সফোর্ড, লিনেন আর GSM — সহজ ভাষায়, যেন কেনার আগেই মান বুঝতে পারেন।',
   subs:[['cotton','Cotton','কটন'],['gsm','GSM & weight','GSM ও ওজন']], shop:['tshirts','T-shirts','টি-শার্ট']},
  {id:'fit', en:'Fit & size', bn:'ফিট ও সাইজ', ico:'ruler',
   intro:'How each garment should fit, how to measure yourself, and how to pick the right size online the first time.',
   introBn:'কোন পোশাক কেমন ফিট হবে, নিজের মাপ কীভাবে নেবেন, আর অনলাইনে প্রথমবারেই সঠিক সাইজ কীভাবে বাছবেন।',
   subs:[['size-charts','Size charts','সাইজ চার্ট'],['fit-types','Fit types','ফিটের ধরন']], shop:['polos','Polos','পোলো']},
  {id:'season', en:'Occasions & seasons', bn:'উৎসব ও মৌসুম', ico:'sun',
   intro:'What to wear for Eid, winter, weddings and the long Bangladesh summer — planned ahead.',
   introBn:'ঈদ, শীত, বিয়ে আর লম্বা গ্রীষ্মে কী পরবেন — আগে থেকেই পরিকল্পনা।',
   subs:[['eid','Eid','ঈদ'],['winter','Winter','শীত'],['wedding','Weddings','বিয়ে']], shop:['hoodies','Hoodies','হুডি']},
  {id:'brand', en:'Product & brand', bn:'প্রোডাক্ট ও ব্র্যান্ড', ico:'box',
   intro:'The stories behind our own pieces, and care guides for the brands our customers wear.',
   introBn:'আমাদের নিজেদের পোশাকের পেছনের গল্প, আর কাস্টমাররা যেসব ব্র্যান্ড পরেন সেগুলোর যত্নের গাইড।',
   subs:[['how-we-make','How we make it','কীভাবে বানাই'],['tests','Our tests','আমাদের টেস্ট']], shop:['polos','Polos','পোলো']}
];
/* the admin's "Section" list (94) → pillar / sub-category, until the admin stores a pillar itself */
var BF_SEC = {'Size guide':['fit','size-charts'], 'Fit guide':['fit','fit-types'], 'Style':['style','casual'], 'Fabric':['fabric','cotton'],
  'Care':['care','washing'], 'Winter':['season','winter'], 'Behind EXTAS':['brand','how-we-make']};
/* better homes and tags for the shop's twelve original journal pieces (seed posts in 94) */
var BF_SEEDMAP = {
  'how-to-pick-your-polo-size':['fit','size-charts',['polo','size-chart']],
  'chino-or-twill-which-trouser':['fit','fit-types',['trousers','fit']],
  'what-to-wear-for-eid-2026':['season','eid',['eid','panjabi']],
  'panjabi-length-and-sleeve-guide':['fit','size-charts',['panjabi','size-chart','eid']],
  'five-ways-to-wear-a-knit-polo':['style','casual',['polo','knit']],
  'why-we-only-exchange-for-size':['brand','how-we-make',['exchange','behind-extas']],
  'linen-in-the-hot-months':['fabric','cotton',['linen','summer','shirt']],
  'building-a-ten-piece-menswear-capsule':['style','casual',['capsule','basics']]
};

/* ---------- authors (PR 593): five AI author agents under Doot, one per pillar ----------
   Read from ST.blogAuthors = [{id, code, name, bn, pillar, bio, photo, reviewer}]
   (Gyani's backend); this seed has the same five. `reviewer` is the real staff
   reviewer the owner names per author/section — empty in the seed, and the
   "Reviewed by" line shows only when it is filled (owner, 12:26). No invented
   human personas, no fake photos: the avatar is an initial on the pillar colour,
   or the owner's uploaded illustration in `photo`. */
var BLOG_AUTHORS_SEED = [
  {id:'jotno', code:'A360-09', name:'Jotno', bn:'যত্ন', pillar:'care', pillars:['care'], col:'#2F6B5E', photo:'', reviewer:'',
   bio:'Writes our care and washing guides: how to wash, dry, iron and store clothes so they last in Bangladesh heat and monsoon damp.',
   bioBn:'কাপড় ধোয়া, শুকানো, ইস্ত্রি আর গুছিয়ে রাখার গাইড লেখে — যেন বাংলাদেশের গরম আর বর্ষাতেও কাপড় টেকে।'},
  {id:'rong', code:'A360-10', name:'Rong', bn:'রঙ', pillar:'style', pillars:['style'], col:'#8A3D5A', photo:'', reviewer:'',
   bio:'Writes our styling guides: outfits for the office, weekends and family events from pieces most men already own.',
   bioBn:'স্টাইলের গাইড লেখে — অফিস, ছুটির দিন আর পারিবারিক অনুষ্ঠানের সাজ, হাতের কাপড় দিয়েই।'},
  {id:'suta', code:'A360-08', name:'Suta', bn:'সুতা', pillar:'fabric', pillars:['fabric','fit'], col:'#6B5B3E', photo:'', reviewer:'',
   bio:'Writes our fabric and fit guides: piqué, jersey, GSM, and how each garment should fit, checked against our own size charts.',
   bioBn:'কাপড় আর ফিটের গাইড লেখে — পিকে, জার্সি, GSM, আর কোন পোশাক কেমন ফিট হবে, আমাদের সাইজ চার্টের সাথে মিলিয়ে।'},
  {id:'ritu', code:'A360-11', name:'Ritu', bn:'ঋতু', pillar:'season', pillars:['season'], col:'#3D5A80', photo:'', reviewer:'',
   bio:'Writes our seasons and occasions guides: Eid, winter, weddings and the long summer, published well before each season.',
   bioBn:'ঋতু আর উপলক্ষের গাইড লেখে — ঈদ, শীত, বিয়ে আর লম্বা গ্রীষ্ম, প্রতিটা মৌসুমের অনেক আগেই।'},
  {id:'bazar', code:'A360-12', name:'Bazar', bn:'বাজার', pillar:'brand', pillars:['brand'], col:'#7A5A2E', photo:'', reviewer:'',
   bio:'Writes our brand and product stories: what goes into our own pieces, and care guides for the brands our customers wear.',
   bioBn:'ব্র্যান্ড আর প্রোডাক্টের গল্প লেখে — আমাদের পোশাকে কী আছে, আর কাস্টমারদের পছন্দের ব্র্যান্ডের যত্নের গাইড।'}
];
/* pillar colours for the initial avatars (all pass 4.5:1 with white text) */
var BF_PCOL = {care:'#2F6B5E', style:'#8A3D5A', fabric:'#6B5B3E', fit:'#6B5B3E', season:'#3D5A80', brand:'#7A5A2E'};

/* ---------- house ads (PR 592) ----------
   Shape shared with Gyani's backend (ST.blogAds). Fallback seed below.
   type: banner | product | combo | category · img: "<productId>[:<colour>]" draws
   the garment, or an http(s)/data: URL for an uploaded banner.
   Slots: home-top · home-grid · cat-top · post-top · post-inline · post-sidebar
   · post-end · post-popup — plus post-bar (the slim bar after 60% of the
   article; Shilpi's addition, see the report). */
var BLOG_ADS_SEED = [
  {id:'ad-winter-hoodie', type:'banner', title:'Winter mornings sorted', sub:'Heavyweight 320 GSM fleece hoodies, brushed inside.', cta:'Shop hoodies', link:'#/c/hoodies',
   img:'heavyweight-hoodie:black', slots:['home-top','cat-top','post-inline','post-sidebar','post-end'], pillars:[], posts:[], start:'', end:'', active:true, weight:3},
  {id:'ad-polo-duo', type:'combo', comboId:'polo-duo', title:'Polo Duo — any two colours', sub:'Two Essential Piqué Polos at one set price.', cta:'Choose colours', link:'#/combo/polo-duo',
   slots:['home-grid','post-inline','post-sidebar','post-end'], pillars:['care','fit','fabric','style','brand'], posts:[], active:true, weight:3},
  {id:'ad-pique-polo', type:'product', productId:'essential-pique-polo', title:'Essential Piqué Polo', sub:'220 GSM combed cotton · free delivery', cta:'Add to bag',
   slots:['home-grid','cat-top','post-top','post-inline'], pillars:['care','fit','fabric','brand','style'], posts:[], active:true, weight:2},
  {id:'ad-cat-panjabi', type:'category', catId:'panjabi', title:'Panjabi for Eid and weddings', sub:'Fine cotton voile in white, sky and maroon.', cta:'See panjabi', link:'#/c/panjabi',
   slots:['home-grid','cat-top','post-top','post-inline','post-end'], pillars:['season'], posts:[], active:true, weight:2},
  {id:'ad-denim-popup', type:'banner', title:'Denim that is easy to look after', sub:'Stretch slim-fit jeans — cold machine wash, no soaking needed.', cta:'See the jeans', link:'#/p/lv-slim-jeans',
   img:'lv-slim-jeans:navy', slots:['post-popup'], pillars:[], posts:['how-to-wash-denim'], active:true, weight:1,
   popup:{trigger:'scroll', value:50, freq:'session', delay:0}},
  {id:'ad-bar-polos', type:'category', catId:'polos', title:'Polos from ৳690', sub:'', cta:'Shop polos', link:'#/c/polos',
   slots:['post-bar'], pillars:['care','fit','fabric','brand','style'], posts:[], active:true, weight:1}
];
var BLOG_AD_SETTINGS_SEED = {gridEvery:6, inlineAfter:3, maxInline:2, popupOnMobileFromSearch:false};

/* ---------- words on the customer pages (site language: English, Bengali on /bn or when switched) ---------- */
var BF_T = {
 en:{journal:'The EXTAS Journal', journalShort:'Journal', home:'Home', dek:'Care, fit, fabric and style guides for men in Bangladesh — from people who make clothes for a living.',
  all:'All', search:'Search', searchPh:'Search guides', searchLabel:'Search the journal', latest:'Latest guides', loadMore:'Load more', showing:'Showing {a} of {b}',
  minRead:'{n} min read', minShort:'{n} min', updated:'Updated {d}', published:'Published {d}', by:'By {a}', reviewed:'Reviewed by {a}', reviewedShort:'Reviewed by {a}',
  quick:'Quick answer', inGuide:'In this guide', sections:'{n} sections', contents:'Contents', prodsIn:'Products in this guide', add:'Add to bag', addShort:'Add', view:'View',
  chooseCol:'Choose colours', save:'Save {x}', share:'Share this guide', copy:'Copy link', copied:'Link copied', related:'More in {p}', tags:'Tags', taggedH:'Tagged “{t}”',
  archive:'Archive', authors:'Authors', startHere:'Start here', pillarGuide:'Pillar guide', adLabel:'EXTAS offer', demo:'Demo', readEn:'Read in English', shopLook:'Shop the look',
  newsH:'One useful guide a week', newsP:'Care, fit and style notes. No spam — leave any time.', newsLabel:'Email or WhatsApp number', newsBtn:'Subscribe',
  newsOk:'Thanks — the next guide will reach you.', newsErr:'Enter an email (name@example.com) or an 11-digit mobile number starting 01.',
  results:'{n} results for “{q}”', result1:'1 result for “{q}”', noResults:'No guides match “{q}”.', tryTags:'Try one of these', searchH:'Search the journal',
  aboutH:'About this guide', aboutP:'Written by {a}, one of EXTAS’s AI writing team, and checked by our team before it went live. Our authors proofread each other — never their own post.', honest:'Written by EXTAS’s AI writing team, checked by our team.', aiAuthor:'AI author · {p}', reviewedBy:'Reviewed by {r}', howWe:'How we write and check our guides',
  wrote:'Guides written', reviewedN:'Guides reviewed', rss:'RSS', rssH:'RSS feed', browse:'More ways to browse', shortNote:'This is a short note. The full guide is being written.',
  moreBn:'More Bengali guides are on the way.', allEn:'All guides in English', notFound:'Guide not found', allGuides:'All guides', noThanks:'No thanks', close:'Close',
  dismiss:'Hide this bar', inCat:'All in {p}', fromP:'From {x}', colours:'{n} colours', chooseSize:'Choose a size', added:'Added to bag', viewBag:'View bag', pickSize:'Pick a size first',
  soldOut:'sold out', brandGuide:'Brand guide', posts:'{n} guides', post1:'1 guide', archiveH:'Archive', archiveP:'Every guide, month by month.', tagsH:'Popular tags',
  crumbTags:'Tags', crumbAuth:'Authors', crumbSearch:'Search', guidesBy:'Guides by the {a}', guidesRev:'Reviewed by the {a}', colour:'Colour', size:'Size', fullDetails:'See full details',
  noBn:'This guide is not in Bengali yet, so it shows in English.', breadcrumb:'Breadcrumb', cats:'Journal categories', step:'Step', tip:'Tip', note:'Good to know', inSub:'Sub-categories',
  feat:'Featured', viewAll:'View all', moreGuides:'More guides', emptyList:'No guides here yet.', share_wa:'WhatsApp', share_fb:'Facebook'},
 bn:{journal:'EXTAS জার্নাল', journalShort:'জার্নাল', home:'হোম', dek:'বাংলাদেশের ছেলেদের জন্য কাপড়ের যত্ন, ফিট, ফ্যাব্রিক আর স্টাইলের গাইড — যারা কাপড় বানায় তাদের হাতে লেখা।',
  all:'সব', search:'খুঁজুন', searchPh:'গাইড খুঁজুন', searchLabel:'জার্নালে খুঁজুন', latest:'নতুন গাইড', loadMore:'আরও দেখুন', showing:'{b}টির মধ্যে {a}টি',
  minRead:'{n} মিনিট পড়া', minShort:'{n} মিনিট', updated:'আপডেট {d}', published:'প্রকাশ {d}', by:'লিখেছে {a}', reviewed:'যাচাই করেছে {a}', reviewedShort:'যাচাই: {a}',
  quick:'সংক্ষেপে উত্তর', inGuide:'এই গাইডে', sections:'{n}টি অংশ', contents:'সূচি', prodsIn:'এই গাইডের প্রোডাক্ট', add:'ব্যাগে রাখুন', addShort:'রাখুন', view:'দেখুন',
  chooseCol:'রং বাছুন', save:'{x} সাশ্রয়', share:'গাইডটি শেয়ার করুন', copy:'লিংক কপি', copied:'লিংক কপি হয়েছে', related:'{p} নিয়ে আরও', tags:'ট্যাগ', taggedH:'ট্যাগ: “{t}”',
  archive:'আর্কাইভ', authors:'লেখক', startHere:'এখান থেকে শুরু', pillarGuide:'মূল গাইড', adLabel:'EXTAS অফার', demo:'ডেমো', readEn:'Read in English', shopLook:'লুকটা কিনুন',
  newsH:'সপ্তাহে একটা কাজের গাইড', newsP:'যত্ন, ফিট আর স্টাইলের টিপস। কোনো স্প্যাম নয় — যখন খুশি বন্ধ করবেন।', newsLabel:'ইমেইল বা WhatsApp নম্বর', newsBtn:'সাবস্ক্রাইব',
  newsOk:'ধন্যবাদ — পরের গাইড আপনার কাছে পৌঁছে যাবে।', newsErr:'একটা ইমেইল (name@example.com) বা ০১ দিয়ে শুরু ১১ সংখ্যার মোবাইল নম্বর দিন।',
  results:'“{q}” — {n}টি ফল', result1:'“{q}” — ১টি ফল', noResults:'“{q}” নিয়ে কোনো গাইড পাওয়া যায়নি।', tryTags:'এগুলো দেখুন', searchH:'জার্নালে খুঁজুন',
  aboutH:'এই গাইড সম্পর্কে', aboutP:'লিখেছে {a} — EXTAS-এর AI লেখক টিমের একজন; চালু হওয়ার আগে আমাদের টিম যাচাই করেছে। আমাদের লেখকরা একে অন্যের লেখা দেখে দেয় — নিজের লেখা কখনো নিজে না।', honest:'লেখাগুলো EXTAS-এর AI লেখক টিমের, যাচাই করে আমাদের টিম।', aiAuthor:'AI লেখক · {p}', reviewedBy:'যাচাই করেছেন {r}', howWe:'আমরা কীভাবে লিখি ও যাচাই করি',
  wrote:'লেখা গাইড', reviewedN:'যাচাই করা গাইড', rss:'RSS', rssH:'RSS ফিড', browse:'আরও যেভাবে খুঁজবেন', shortNote:'এটা ছোট একটা নোট। পুরো গাইড লেখা চলছে।',
  moreBn:'আরও বাংলা গাইড আসছে।', allEn:'সব গাইড ইংরেজিতে', notFound:'গাইডটি পাওয়া যায়নি', allGuides:'সব গাইড', noThanks:'না, ধন্যবাদ', close:'বন্ধ করুন',
  dismiss:'বারটি লুকান', inCat:'{p}: সব', fromP:'{x} থেকে', colours:'{n}টি রং', chooseSize:'সাইজ বাছুন', added:'ব্যাগে রাখা হয়েছে', viewBag:'ব্যাগ দেখুন', pickSize:'আগে সাইজ বাছুন',
  soldOut:'শেষ', brandGuide:'ব্র্যান্ড গাইড', posts:'{n}টি গাইড', post1:'১টি গাইড', archiveH:'আর্কাইভ', archiveP:'সব গাইড, মাস ধরে।', tagsH:'জনপ্রিয় ট্যাগ',
  crumbTags:'ট্যাগ', crumbAuth:'লেখক', crumbSearch:'খোঁজ', guidesBy:'{a}-এর লেখা', guidesRev:'{a}-এর যাচাই করা', colour:'রং', size:'সাইজ', fullDetails:'সব তথ্য দেখুন',
  noBn:'এই গাইডটা এখনো বাংলায় নেই, তাই ইংরেজিতে দেখানো হচ্ছে।', breadcrumb:'পথ', cats:'জার্নালের ক্যাটাগরি', step:'ধাপ', tip:'টিপস', note:'জেনে রাখুন', inSub:'সাব-ক্যাটাগরি',
  feat:'বাছাই করা', viewAll:'সব দেখুন', moreGuides:'আরও গাইড', emptyList:'এখানে এখনো কোনো গাইড নেই।', share_wa:'WhatsApp', share_fb:'Facebook'}
};

/* ---------- demo guides (marked "Demo") ----------
   Body markup, one block per line group:
     ## heading (goes into the contents)   ### sub-heading
     > tip: … / > note: …                    a tip or "good to know" box
     1. …  (consecutive)                     a step box     - … (consecutive)  a list
     [fig <productId> <colour> | caption]    a garment drawing with a caption
     [products]                              where "Products in this guide" sits
     [link text](#/route)  **bold**          inline
   House ads go in by themselves after paragraph N (settings), never inside a box. */
var BF_DEMO = [
{slug:'how-to-keep-a-polo-shirt-in-shape', author:'jotno', pillar:'care', sub:'washing', tags:['polo','washing','pique','cotton'],
 date:'2026-10-17', updated:'2026-10-18', img:['essential-pique-polo','navy'], featured:true, guide:true,
 products:['essential-pique-polo','ct-basic-polo'], combos:['polo-duo'], shop:['polos','Shop polos','পোলো দেখুন'],
 title:'How to keep a polo shirt in shape',
 dek:'Cold water, shade-drying and folding instead of hanging: the small habits that keep a polo looking new for years.',
 quick:'Wash it inside out in cold water (30°C or below) with the buttons done up, never tumble dry, and dry it flat or on a wide hanger in the shade. Fold it to store, and never press the ribbed collar flat with an iron.',
 body:`A good polo is built to keep its shape: a ribbed collar that stands, a placket that lies flat and a body that falls straight. Most polos that look tired after a few months were not worn out — they were washed and dried the wrong way. Here is the routine we follow for our own [piqué polos](#/c/polos), and it works for any cotton polo.

## Before you wash
Do up all the buttons on the placket. An open placket twists in the drum, and that twist is what makes it ripple later. Turn the polo inside out so the surface rubs less against other clothes; piqué texture pills when it rubs.

Wash darks with darks. A new navy or black polo can still release dye in its first two washes — our guide to [washing dark colours](#/journal/wash-black-and-navy-so-they-stay-dark) explains why.

> tip: Check the care label first. If it says 30°C, treat that as the maximum, not the target.

## How to wash it
1. Use cold or lukewarm water — 30°C or below. Hot water is the main reason cotton polos shrink and collars curl.
2. Choose a gentle or "delicates" cycle and a short spin. A hard spin stretches the wet collar.
3. Use a mild liquid detergent and skip bleach, even on white.
4. Don't overload the machine. Clothes need room to move, or they come out creased and twisted.

Hand washing is even kinder: soak for 15 minutes in cold water with a little detergent, squeeze gently — never wring — and rinse until the water runs clear.

## Drying: where most polos are ruined
Never put a cotton polo in a hot dryer. Heat shrinks the fibres and tightens the rib collar so it pulls away from the body. Instead, reshape it while it is damp: pull the collar straight, line up the placket and smooth the side seams. Then dry it flat on a towel or on a wide plastic hanger. A thin wire hanger leaves bumps on the shoulders that do not iron out.

Dry in the shade, not in direct sun. In Dhaka the afternoon sun is strong enough to fade navy, black and red within a season. A shaded balcony or a fan indoors is enough; a cotton polo dries in a few hours even in humid weather.

[fig essential-pique-polo navy | Dry a polo flat or on a wide hanger, with the collar straightened while it is still damp.]

## Ironing the collar and placket
Iron the body inside out on medium heat while it is still slightly damp. Press the placket from the inside so the buttons don't leave a shine. Leave the ribbed collar alone: pressing it flat kills its natural roll. If it curls, steam it lightly and shape it with your fingers.

[products]

## Storing it
Fold polos rather than hanging them for weeks. A knit stretches under its own weight, so a hung polo slowly grows longer and its shoulders droop. Fold it in thirds with the collar on top. During the monsoon, keep a sachet of silica gel or a few neem leaves in the drawer to keep damp and insects away.

## How often should you wash it?
A polo worn for a full day in Bangladesh heat should be washed after one wear — sweat left in cotton yellows the collar and underarms. A polo worn for an hour in an air-conditioned office can manage a second wear if you air it overnight on a hanger.

> note: Not sure about your size before you buy? Read [how a polo should fit](#/journal/how-a-polo-should-fit) first.`},

{slug:'how-to-wash-denim', author:'jotno', pillar:'care', sub:'washing', tags:['denim','washing','jeans'],
 date:'2026-10-16', updated:'2026-10-16', img:['lv-slim-jeans','navy'],
 products:['lv-slim-jeans','relaxed-twill-trousers'], combos:[], shop:['trousers','Shop trousers','ট্রাউজার দেখুন'],
 title:'How to wash raw denim without fading it',
 dek:'Raw denim fades to your shape over months of wear. Wash it the wrong way once and that fade is gone. Here is the right way.',
 quick:'Wait as long as you can before the first wash, then soak the jeans inside out in cold water with a little mild detergent for 30–45 minutes, rinse, and hang them to dry in the shade. No hot water, no machine, no dryer.',
 body:`Raw denim is denim that has not been washed after dyeing. It is stiff, dark and slightly shiny, and over months of wear it fades where your body creases it — behind the knees, at the hips, around the phone in your pocket. That personal fade is the point. The fastest way to lose it is a hot machine wash.

## Raw, sanforized or stretch: know what you have
- **Raw (unwashed) denim** — never washed at the mill. Deepest indigo, most fading, most care.
- **Sanforized raw denim** — pre-shrunk at the mill, so it shrinks only a little, usually 1–3%. Most raw jeans sold today are this.
- **Unsanforized ("shrink-to-fit")** — can shrink 7–10% in the first soak. Buy a size up in the waist and length.
- **Washed or stretch denim** — already washed at the factory, often with 1–2% elastane. Our [slim-fit jeans](#/p/lv-slim-jeans) are this kind: a cold machine wash inside out is fine.

## When to wash for the first time
Purists wait six months. In Dhaka's heat and humidity that is unrealistic: sweat and dust break down cotton fibres faster than washing does. A good rule here is to wear them hard for six to eight weeks, then do the first soak. After that, wash when they smell or look dirty, not on a schedule.

## The soak method, step by step
1. Turn the jeans inside out and button the fly. This protects the outer face, where the fade shows.
2. Fill a bucket or bathtub with cold water — the colder the better — and add a teaspoon of mild liquid detergent.
3. Lay the jeans flat under the water and press out the air. Leave them for 30–45 minutes, moving them gently once or twice.
4. Drain, refill with clean cold water and rinse twice. Don't wring or twist; press the water out by rolling the jeans in a towel.
5. Hang them by the waistband, still inside out, in the shade.

> tip: The first soak turns the water blue. That is loose surface dye, not your fade disappearing — but it does stain, so soak raw denim on its own and keep it away from white towels.

[fig lv-slim-jeans navy | Soak inside out in cold water. The blue in the water is loose surface dye.]

## Drying, and why the sun matters
Indigo fades fastest in sunlight. A rooftop in May can do in an afternoon what six months of wear does. Dry raw denim indoors or in deep shade, with a fan if the air is humid. Never use a tumble dryer: heat shrinks cotton unevenly and leaves pale streaks along the seams.

Between washes, air the jeans overnight on a hanger after a long day, spot-clean marks with a damp cloth and a drop of detergent, and brush off dust with a soft clothes brush. The freezer trick does not clean jeans — cold does not reliably kill the bacteria that cause smell. Fresh air and an occasional soak do more.

[products]

## What about vinegar and salt?
You will read that a cup of vinegar or a handful of salt "locks in" indigo. There is little good evidence for it with modern dyes, and vinegar can leave a smell. Cold water and fewer washes do the real work.

For everyday trousers that need far less care, see [chino or twill: which trouser](#/journal/chino-or-twill-which-trouser), and for the rest of your dark clothes, [washing dark colours so they stay dark](#/journal/wash-black-and-navy-so-they-stay-dark).`},

{slug:'winter-layering-in-dhaka', author:'ritu', pillar:'season', sub:'winter', tags:['winter','hoodie','layering','dhaka-weather'],
 date:'2026-10-04', updated:'2026-10-15', img:['heavyweight-hoodie','black'], guide:true,
 products:['heavyweight-hoodie','ct-fleece-hoodie','ct-crew-sweater'], combos:['ct-hoodie-jogger'], shop:['hoodies','Shop hoodies','হুডি দেখুন'],
 title:'Winter layering in Dhaka: one good layer beats three',
 dek:'Foggy 13°C mornings, warm afternoons: how to dress in layers you can take off, and which single winter piece is worth buying.',
 quick:'Dhaka winter days can swing about 10°C between a foggy morning and a warm afternoon, so wear layers you can take off: a cotton T-shirt, a knit polo or sweater, and a hoodie or light jacket for mornings, evenings and bike rides.',
 body:`Winter in Dhaka is short and mild by world standards, but it does not feel mild at seven in the morning on a rickshaw. From late December to early February, mornings often sit around 12–15°C with fog, and afternoons climb back to the mid-20s. In the north — Rangpur, Dinajpur, Panchagarh — cold waves can push nights below 10°C. The trick is not to dress warm; it is to dress in layers you can take off.

## The three-layer rule
1. **Base:** a cotton T-shirt or long-sleeve tee. It sits against your skin and takes the sweat, so it should be the easiest thing to wash. [Everyday tees](#/c/tshirts) at 160–180 GSM are right.
2. **Middle:** a knit polo, sweatshirt or light sweater. This layer holds warmth and still looks finished on its own when the afternoon warms up.
3. **Outer:** a hoodie, fleece or light jacket for mornings, evenings and anything on two wheels. Take it off at noon and tie it to your bag.

> tip: If you can only buy one winter piece, make it the outer layer. A good 300–320 GSM fleece hoodie does more than three thin tops.

## Choosing the outer layer
- **Fleece hoodie** — brushed inside, so it traps air. The best value for cold Dhaka mornings. Look for 300 GSM or more; under 250 feels like a sweatshirt.
- **Zip hoodie** — easier to open as the day warms up; better if you commute by bus or bike.
- **Quilted puffer** — for the north, for a trip to Sylhet's tea gardens, or for night rides. Too warm for a Dhaka afternoon.

[fig heavyweight-hoodie black | A 320 GSM fleece hoodie: the one winter layer that earns its place.]

## Colours that work in winter
Winter is when darker colours make sense. Black, charcoal, olive, maroon and bottle green hide the dust of dry-season roads better than light grey. Pair one dark outer layer with a lighter base so the outfit doesn't look heavy.

[products]

## What to wear for…
### The office
A long-sleeve polo or an Oxford shirt under a crew-neck sweater. Keep the hoodie for the commute.

### Weekends and family visits
A tee, an open zip hoodie and chinos or joggers. Easy to adjust indoors, where it is warmer.

### Evening weddings
A knit polo or a panjabi with a shawl or dark jacket over it. Winter weddings in Bangladesh are often outdoors in the evening, when it is coldest.

## Caring for winter clothes
Fleece pills when it rubs. Wash hoodies inside out in cold water and dry them flat in the shade — the same way you would [keep a polo in shape](#/journal/how-to-keep-a-polo-shirt-in-shape). Before you put winter clothes away in February, wash them, dry them fully and store them with silica gel: the monsoon damp that follows is what causes musty smells. Shop the season in [hoodies](#/c/hoodies).`},

{slug:'pique-vs-jersey-polo', author:'suta', pillar:'fabric', sub:'cotton', tags:['polo','pique','jersey','cotton'],
 date:'2026-10-12', updated:'2026-10-12', img:['jersey-zip-polo','grey'], guide:true,
 products:['essential-pique-polo','jersey-zip-polo','textured-knit-polo'], combos:[], shop:['polos','Shop polos','পোলো দেখুন'],
 title:'Piqué vs jersey polo: what’s the difference?',
 dek:'Two polos can look the same on a hanger and feel completely different on a hot afternoon. The difference is the knit.',
 quick:'Piqué is a textured knit with a small raised pattern: it breathes, holds its shape and hides sweat, so it is the classic choice for Bangladesh heat. Jersey is a flat, smooth knit that feels softer and drapes closer — more casual, but it shows creases and sweat more easily.',
 body:`Two polos can look the same on a hanger and feel completely different on a hot afternoon. The difference is usually the knit: piqué or jersey. Both are knitted rather than woven cotton, so both stretch a little. What changes is the surface, and that changes how the polo breathes, hangs and ages.

## What piqué is
Piqué (say "pee-kay") is knitted with a raised, textured pattern — small squares, a honeycomb or a waffle. Run your thumb across it and you feel the grain. That texture does three useful things:
- It holds the fabric slightly away from your skin, so air moves and the polo feels cooler.
- It hides sweat patches and small creases better than a flat fabric.
- It has body, so the collar and placket stand up and the polo keeps a clean line.

Our [Essential Piqué Polo](#/p/essential-pique-polo) uses a 220 GSM combed-cotton piqué for exactly these reasons.

## What jersey is
Jersey is the flat, smooth knit most T-shirts are made from. It is softer to the touch, lighter, and drapes closer to the body. Jersey polos often have a little stretch, which makes them comfortable on long days. The trade-off: jersey shows sweat and creases more, and the collar is usually softer, so it can roll or flop.

[fig jersey-zip-polo grey | Jersey: a smooth face, a softer drape and a more casual look.]

## Side by side
- **Feel:** piqué is textured and crisp; jersey is smooth and soft.
- **Heat:** piqué breathes better; jersey can cling when you sweat.
- **Look:** piqué is smarter — office, events, family dinners. Jersey is relaxed — weekends, travel, under a jacket.
- **Shape:** piqué keeps its structure; jersey drapes and can grow longer if it is hung.
- **Care:** both like cold water and shade-drying; piqué can pill if it is washed with rough fabrics such as denim.

> tip: For your first polo in Bangladesh, choose piqué in navy, white or black. It works in the most situations and forgives a long, humid day.

## And the knit polo?
A textured knit polo, like our [Textured Knit Polo](#/p/textured-knit-polo), is a third option: a heavier, sweater-like knit at around 260 GSM. It sits between a polo and a light sweater, and it is ideal for winter evenings and weddings rather than a July afternoon.

[products]

## How to tell them apart in a shop
Hold the fabric up to the light. Piqué shows a tiny grid or honeycomb of small holes; jersey looks even and flat. Then check the collar: a piqué polo usually has a firm ribbed collar, while jersey polos often have a collar cut from the body fabric.

Whichever you choose, fit matters more than fabric. Read [how a polo should fit](#/journal/how-a-polo-should-fit) before you pick a size, and [what GSM means](#/journal/what-gsm-means) if you want to compare weights.`},

{slug:'how-a-polo-should-fit', author:'suta', pillar:'fit', sub:'fit-types', tags:['polo','fit','size-chart'],
 date:'2026-10-14', updated:'2026-10-18', img:['essential-pique-polo','white'], guide:true,
 products:['essential-pique-polo','contrast-collar-polo','long-sleeve-polo'], combos:[], shop:['polos','Shop polos','পোলো দেখুন'],
 title:'How a polo should fit: five checks in the mirror',
 dek:'Shoulders, sleeves, chest, length and collar — thirty seconds in front of a mirror tells you whether a polo is right.',
 quick:'The shoulder seam should sit on the edge of your shoulder bone, the sleeves should end mid-bicep with room for one finger, and you should be able to pinch 2–3 cm of fabric at each side of the chest. Untucked, the hem should cover your belt and stop around the middle of your fly.',
 body:`A ৳850 polo that fits will look better than a ৳5,000 polo that doesn't. The good news is that fit comes down to five checkpoints you can test in a mirror in thirty seconds.

## 1. Shoulders
The shoulder seam should sit right on the outer edge of your shoulder bone. If it drops down your arm, the polo is too big and will look sloppy however you style it. If it sits up on top of your shoulder, it is too small and will pull across the back when you reach forward.

## 2. Sleeves
Polo sleeves should end around the middle of your bicep and hug it lightly. Slide a finger under the sleeve band: one finger is right; if your whole hand fits, the sleeves are too wide. Sleeves that reach the elbow make arms look short.

## 3. Chest and body
Stand straight and pinch the fabric at the side of your chest. About 2–3 cm on each side is a regular fit; less than that is slim; much more and the polo will balloon when you tuck it in. The fabric should fall straight from chest to hem without pulling into lines across the buttons.

[fig essential-pique-polo white | Shoulder seam on the shoulder bone, sleeve at mid-bicep, a little room at the chest.]

## 4. Length
Untucked, the hem should cover your belt and end around the middle of your trouser fly. If it covers your back pockets completely, it is too long to wear untucked. If you plan to tuck it in for the office, a couple of centimetres longer is fine.

## 5. Collar
Buttoned to the second button, the collar should sit flat and close around your neck with no gap at the back. A collar that gapes usually means the polo is too big in the shoulders as well.

> tip: The easiest way to find your size online: lay a polo you already like flat, measure across the chest from armpit to armpit and double it. Compare that number with the chest figure in our [size guide](#/size-guide).

## Regular fit or slim fit?
Regular fit leaves room at the chest and waist; it is comfortable in heat and suits most body types. Slim fit is cut closer through the body and sleeves; it looks sharp on a slim build but shows everything on a hot day. Between two sizes? Take the larger in regular fit and the smaller in slim.

[products]

## When it still isn't right
Every body is different, and sizing varies between brands. If your polo arrives and the shoulders or length are off, you can swap the size — see our [exchange rules](#/page/exchange). Once you have the right size, keep it that way with [how to keep a polo shirt in shape](#/journal/how-to-keep-a-polo-shirt-in-shape).`},

{slug:'what-to-wear-for-eid', author:'ritu', pillar:'season', sub:'eid', tags:['eid','panjabi','festive','polo'],
 date:'2026-10-06', updated:'2026-10-06', img:['classic-cotton-panjabi','white'],
 products:['classic-cotton-panjabi','textured-knit-polo','slim-chino-trousers'], combos:[], shop:['panjabi','Shop panjabi','পাঞ্জাবি দেখুন'],
 title:'What to wear for Eid: five outfits for the whole weekend',
 dek:'Eid is not one outfit. It is a prayer, a day of visits, a long lunch and an evening out — plan for all of it.',
 quick:'Plan for the whole weekend, not just the prayer: a white or light panjabi for Eid morning, a smart polo or Oxford shirt with chinos for family visits, and a darker panjabi or knit polo for the evening. Order and try everything at least two weeks early, so there is time to exchange a size.',
 body:`Eid is not one outfit. It is an early prayer, a day of visiting relatives, a big lunch, maybe a long drive to the village and an evening out with friends. Here are five outfits that cover the weekend, and how to plan them without a last-minute rush.

## 1. Eid morning: the classic panjabi
For the Eid prayer, a white, off-white or sky-blue panjabi is hard to beat. Cotton voile or fine cotton keeps you cool in a crowded Eidgah, and light colours look fresh in photos. Pair it with a slim white pajama or straight trousers and simple sandals.

[fig classic-cotton-panjabi white | A white cotton panjabi: the Eid-morning classic.]

> tip: A panjabi should fall around or just below the knee. Check our [panjabi length and sleeve guide](#/journal/panjabi-length-and-sleeve-guide) before you choose a size.

## 2. Visiting family: polo and chinos
After lunch, many men change into something easier. A [piqué polo](#/c/polos) in navy, bottle green or maroon with khaki or navy chinos is smart enough for elders' homes and comfortable for a full day of visits. Tuck it in with a belt for a neater look.

## 3. Lunch with the in-laws: an Oxford shirt
If the family is formal, an Oxford shirt in white or sky blue with chinos is a safe step up. Roll the sleeves twice after the meal — see [one Oxford shirt, three ways](#/journal/one-oxford-shirt-three-ways).

## 4. Evening: a darker panjabi
Evenings call for richer colours: maroon, navy, bottle green or black. Choose a panjabi with a little texture or a self-stripe so it looks special under lights.

## 5. Day two and the journey home: a knit polo
For the long road trip or the second day of Eid, a textured knit polo with comfortable trousers looks put together without trying too hard.

## Shoes and small details
Simple leather sandals or loafers suit a panjabi; keep trainers for the polo outfits. Keep accessories quiet — a plain watch and, if you like, a light attar rather than a strong spray. A contrast button set can make a plain panjabi look new for a second Eid, which is a cheaper way to refresh what you already own.

[products]

## Plan it two weeks ahead
- **Order early.** Couriers slow down in the last week before Eid.
- **Try everything on as soon as it arrives.** Exchange windows are short; ours is 72 hours.
- **Think about the weather.** Eid-ul-Fitr moves about 11 days earlier each year: it falls in early March in 2027 and moves into February after that, so evenings can be cool.
- **Iron the night before** and hang the panjabi on a wide hanger.

Matching outfits for brothers, or father and son, are popular. Choosing the same colour family — say, shades of blue — looks coordinated without being identical. See all [panjabi](#/c/panjabi).`},

{slug:'what-gsm-means', author:'suta', pillar:'fabric', sub:'gsm', tags:['gsm','cotton','t-shirt','dhaka-weather'],
 date:'2026-09-28', updated:'2026-10-02', img:['heavy-cotton-tee','ecru'],
 products:['everyday-crew-tee','heavy-cotton-tee','heavyweight-hoodie'], combos:[], shop:['tshirts','Shop T-shirts','টি-শার্ট দেখুন'],
 title:'What GSM means: 160 vs 180 vs 240 GSM, explained',
 dek:'The fabric-weight number on every T-shirt listing, decoded: what it changes, what it doesn’t, and which weight suits Dhaka weather.',
 quick:'GSM is grams per square metre — how heavy the fabric is. Around 160–180 GSM is a light everyday T-shirt for summer, 200–240 is a heavier tee or a piqué polo that holds its shape, and 280–320 is sweatshirt and hoodie fleece. Heavier means warmer, not automatically better.',
 body:`You will see a number on most T-shirt and hoodie listings: 160 GSM, 220 GSM, 320 GSM. It is one of the few honest numbers in clothing — if you know how to read it.

## What GSM means
GSM stands for grams per square metre. Cut a one-metre square of the fabric and weigh it: a 180 GSM fabric weighs 180 grams. It tells you how heavy and dense the fabric is. It does not tell you what the fibre is, how the yarn was spun or how well the garment is sewn.

## A quick guide to the numbers
- **140–160 GSM, light.** Thin and airy, slightly see-through in white. Good for very hot days and for wearing under a shirt.
- **170–190 GSM, everyday.** The standard T-shirt weight in Bangladesh. Our [Everyday Crew T-Shirt](#/p/everyday-crew-tee) is 180 GSM.
- **200–240 GSM, substantial.** Heavier tees and piqué polos. Holds its shape, hangs straight and isn't see-through. Our [Heavy Cotton Tee](#/p/heavy-cotton-tee) is 240 GSM.
- **260–320 GSM, heavy.** Knit polos, sweatshirts and fleece hoodies. Warm, and best for winter.

[fig heavy-cotton-tee ecru | 240 GSM: a heavier tee that hangs straight and isn't see-through.]

## Which GSM for Dhaka weather?
From March to October, 160–180 GSM tees and 200–220 GSM piqué polos are the most comfortable. A piqué polo can be heavier than a tee and still feel cool, because its textured knit lets air through — see [piqué vs jersey](#/journal/pique-vs-jersey-polo). From December to February, 300 GSM fleece makes sense for mornings and evenings.

> tip: If a white T-shirt looks see-through in a listing photo, check the GSM. Under 170 almost always shows what is underneath.

## Why higher isn't always better
A heavy fabric made from short, carded cotton can feel rough and pill quickly. A lighter fabric made from long, combed cotton can be softer and last longer. Look at three things together:
1. **GSM** — the weight.
2. **Fibre** — 100% cotton, or a blend with polyester or elastane.
3. **Yarn** — "combed" cotton has the short fibres removed, so it is smoother and stronger.

## A quick test in the shop
If you can touch the garment, three checks tell you more than the label. Hold it up to the light: a dense, even knit lets less through. Stretch a small section and let go — good fabric springs back instead of staying baggy. Rub the inside of the hem between your fingers: combed cotton feels smooth, while short, loose fibres feel fuzzy and will pill sooner. Online, look for the GSM and the fibre in the product details. If a seller won't tell you either, treat that as a warning.

[products]

## Does GSM change after washing?
A little. Cotton shrinks slightly in its first hot wash, which makes the fabric denser, so the GSM goes up a touch while the garment gets smaller. Washing in cold water, as in our guide to [keeping a polo in shape](#/journal/how-to-keep-a-polo-shirt-in-shape), keeps both the size and the feel close to new. Browse every weight in [T-shirts](#/c/tshirts).`},

{slug:'one-oxford-shirt-three-ways', author:'rong', pillar:'style', sub:'office', tags:['shirt','office','oxford'],
 date:'2026-09-22', updated:'2026-09-22', img:['oxford-cotton-shirt','sky'], guide:true,
 products:['oxford-cotton-shirt','slim-chino-trousers'], combos:['office-trio'], shop:['shirts','Shop shirts','শার্ট দেখুন'],
 title:'One Oxford shirt, three ways: office, weekend, dinner',
 dek:'Tucked with chinos on Monday, open over a tee on Friday, sleeves rolled for dinner — one shirt that covers the whole week.',
 quick:'Wear it tucked into chinos with a belt for the office, open over a T-shirt with the sleeves rolled on Friday, and untucked with the top button open for dinner. Buy white or sky blue first — they go with every trouser you own.',
 body:`The Oxford shirt is the most useful shirt a man can own. It is smart enough for an office, relaxed enough for a weekend, and it gets better with every wash. Here is how one shirt covers three very different days.

## What makes an Oxford shirt
Oxford cloth is a cotton weave with a basket-like texture, where two threads cross over two. It is a little thicker and softer than a poplin dress shirt, so it breathes well and doesn't look stiff. Many Oxfords have a button-down collar, which keeps the collar points neat without ironing.

## 1. The office: tucked and tidy
Tuck the shirt fully into [slim chinos](#/p/slim-chino-trousers) in navy, khaki or charcoal. Add a belt that matches your shoes, and keep every button done except the top one.

> tip: For a neat tuck, pull the side seams towards your back before you buckle the belt. That takes away the puff of fabric at the waist.

## 2. Friday or the weekend: open over a tee
Wear it unbuttoned over a plain white or grey T-shirt with the sleeves rolled twice, to just below the elbow. With chinos or jeans this looks relaxed but not careless — right for a day out in Gulshan or a café in Dhanmondi.

[fig oxford-cotton-shirt sky | Sky-blue Oxford: the colour that works with every trouser.]

## 3. Dinner: untucked, top button open
For an evening out, wear it untucked — but only if the hem is fairly straight and ends around the middle of your fly. Open the top button, roll the sleeves and switch to darker trousers. Pink and white work especially well in the evening.

[products]

## Fit checks before you buy
The shoulder seam should sit on your shoulder bone, just as with a polo. Button the shirt and look at the front: if the fabric pulls into an X around the buttons, go up a size. The sleeve should end where your wrist meets your hand, so a little cuff shows under a jacket. Untucked length matters only if you plan to wear it out — check that it covers your belt. Oxford cotton softens with every wash and can shrink a little in hot water, so wash it cold and buy the size that fits today.

## Which colours first?
1. **Sky blue** — the most versatile; it goes with navy, khaki, grey and black.
2. **White** — the smartest; best for formal days and family events.
3. **Pink** — adds personality; great with navy and charcoal.

## Keeping it crisp
Wash it with similar colours in cold or warm water, unbutton the collar points first, and hang it on a hanger straight from the machine. Iron while slightly damp: collar first, then cuffs, sleeves, back and front. To save time, our [Office Trio](#/combo/office-trio) puts shirts and chinos together at a set price. For more combinations, read [building a ten-piece menswear capsule](#/journal/building-a-ten-piece-menswear-capsule).`},

{slug:'inside-the-essential-pique-polo', author:'bazar', pillar:'brand', sub:'tests', tags:['polo','pique','behind-extas'],
 date:'2026-10-10', updated:'2026-10-10', img:['essential-pique-polo','olive'], guide:true,
 products:['essential-pique-polo'], combos:['polo-duo'], shop:['polos','Shop polos','পোলো দেখুন'],
 title:'Inside the Essential Piqué Polo: what we check before it reaches you',
 dek:'The fabric, the fit, the five colours — and the checks every batch goes through before we put it on sale.',
 quick:'The Essential Piqué Polo is 220 GSM combed-cotton piqué in a regular fit, sizes S to XXL. Before a batch goes on sale we check the fabric weight, shrinkage after a home wash, the collar and placket, seams and buttons, and the colour — photographed in daylight, without filters.',
 body:`We sell polos because we have spent years making clothes for other brands. The Essential Piqué Polo is our everyday version of that work: simple, honest and built to survive a Bangladeshi summer. This is what goes into it, and what we check before it reaches your door.

## The fabric
The body is 220 GSM combed-cotton piqué. Combed cotton has the short fibres brushed out before spinning, so the yarn is smoother and pills less. At 220 GSM the fabric is heavy enough to hang straight and hide what is underneath, while the piqué texture keeps air moving — the reasons are in [piqué vs jersey](#/journal/pique-vs-jersey-polo).

## The fit
It is a regular fit: room at the chest and waist, sleeves that end mid-bicep, and a length that works tucked or untucked. Our model is 5'9", 68 kg and wears M. If you are unsure, our [size guide](#/size-guide) and [how a polo should fit](#/journal/how-a-polo-should-fit) will get you there.

[fig essential-pique-polo olive | The Essential Piqué Polo in olive, one of five colours.]

## What we check on every batch
1. **Fabric weight** — a sample is weighed to confirm the GSM on the label.
2. **Shrinkage** — a polo is washed and dried the way you would at home, then measured again.
3. **Collar and placket** — the rib collar must lie flat and the placket must not ripple after washing.
4. **Seams and buttons** — straight side seams, firmly sewn buttons, no loose threads.
5. **Colour** — every colour is checked against the approved shade and photographed in daylight, with no filter.

> note: Demo text: these checks are written from the product data for the review and must be confirmed by the owner before this post goes live.

## Five colours, chosen for here
Navy, black, white, olive and red. Navy and black for the office, white for summer and Eid, olive and red for weekends. Dark colours stay dark if you wash them cold and dry them in the shade — see [washing dark colours](#/journal/wash-black-and-navy-so-they-stay-dark).

## How to make it last
Wash it cold and inside out, dry it in the shade and fold it rather than hanging it. Treated this way, the collar keeps its roll and the colour stays even for many seasons. If a stitch or a button does come loose early, that is exactly what our checks are meant to catch, so tell us on WhatsApp and we will put it right.

[products]

## Two are better than one
Most people wear a good polo two or three times a week, so a second one halves the wear on each. That is why we offer the [Polo Duo](#/combo/polo-duo): any two colours of the Essential Piqué Polo at one set price, so you can rotate them. Delivery and exchange details are on our [delivery page](#/page/delivery).`},

{slug:'premium-pique-polo-care', author:'bazar', pillar:'brand', sub:'', tags:['polo','washing','brand-care'], brand3p:true,
 date:'2026-10-08', updated:'2026-10-08', img:['rl-solid-polo','navy'],
 products:['rl-solid-polo','rl-pique-polo'], combos:[], shop:['polos','Shop polos','পোলো দেখুন'],
 title:'How to care for your Ralph Lauren polo',
 dek:'Most of these polos are cotton piqué with an embroidered logo. Heat is what damages both — here is how to avoid it.',
 quick:'Treat it like any good cotton piqué: wash it inside out in cold water on a gentle cycle, keep it away from bleach and the dryer, and dry it flat in the shade. Iron inside out, and never iron directly over the embroidered logo.',
 body:`A Ralph Lauren polo is one of the most recognisable shirts in the world, and a well-kept one lasts for years. Most are made of cotton piqué — the brand calls it "mesh" — in Classic, Slim or Custom Slim fits. The embroidered logo is the part that most often gets damaged, usually by heat. Here is how to keep both the shirt and the logo looking new.

## Read the label first
Different lines use different fibres: the classic mesh is 100% cotton, while performance and stretch versions contain elastane or polyester. The care label inside the side seam is the final word. If it says cold or 30°C, stick to it.

## Washing
1. Button the placket and turn the polo inside out; this protects the embroidery from rubbing.
2. Wash in cold water on a gentle cycle with similar colours.
3. Use a mild liquid detergent and no bleach, even on white — chlorine yellows cotton and weakens embroidery thread.
4. Use a short, low spin so the collar doesn't stretch.

> tip: Wash a new polo with darks for its first two washes. Strong colours such as navy, red and bottle green can release a little dye at first.

## Drying
Skip the dryer. Heat shrinks cotton mesh and can pucker the fabric around the embroidered logo. Reshape the polo while it is damp — straighten the collar, line up the placket — and dry it flat or on a wide hanger in the shade. Direct sun fades bright colours quickly.

[fig rl-solid-polo navy | Dry it flat in the shade and straighten the collar while it is damp.]

## Ironing around the logo
Iron inside out on medium heat. Never press directly on the embroidered logo from the front: it can flatten the stitching or leave a shine. If you need to press near it, put a thin cotton cloth between the iron and the shirt. Leave the ribbed collar unpressed; a quick burst of steam brings back its shape.

[products]

## Bright colours and white
Bright colours such as yellow, pink and sky blue show fading and sweat marks first. Wash them often but gently, always in cold water, and dry them out of the sun. Wash white after every wear: sweat left in white cotton turns yellow at the collar and underarms, and that yellow is hard to shift later. For a polo that has already yellowed, an hour's soak in cold water with an oxygen-based stain remover — not chlorine bleach — is the safest fix.

## Storing
Fold it instead of hanging it for long periods, so the shoulders don't stretch, and keep a sachet of silica gel in the drawer through the monsoon.

The same routine works for any premium piqué polo: see our full guide to [keeping a polo in shape](#/journal/how-to-keep-a-polo-shirt-in-shape) and our notes on [piqué vs jersey](#/journal/pique-vs-jersey-polo).

> note: Ralph Lauren is a trademark of its owner. EXTAS is not affiliated with or endorsed by Ralph Lauren. This guide is general care advice.`},

{slug:'wash-black-and-navy-so-they-stay-dark', author:'jotno', pillar:'care', sub:'washing', tags:['washing','colour-care','t-shirt'],
 date:'2026-09-15', updated:'2026-09-30', img:['everyday-crew-tee','black'],
 products:['everyday-crew-tee','ct-basic-tee'], combos:['ct-tee-trio'], shop:['tshirts','Shop T-shirts','টি-শার্ট দেখুন'],
 title:'How to wash black and navy so they stay dark',
 dek:'Why dark cotton goes grey within a season, and the four washing habits that stop most of it.',
 quick:'Wash darks inside out in cold water with less detergent and a short cycle, then dry them in the shade. Wash them less often, keep their first two washes separate, and never tumble dry — heat and sunlight are what turn navy and black grey.',
 body:`Black and navy are the colours most men buy most often, and the ones that most often go grey within a season. It isn't bad luck. Dark dye sits on the surface of cotton fibres, and every hot wash, hard spin and hour in the sun wears a little of it away. Four habits stop most of it.

## 1. Turn everything inside out
Fading happens where fabric rubs: against the drum, against zips, against other clothes. Inside out, the rubbing happens on the face nobody sees. Do up buttons and zips too, so they don't scratch.

## 2. Cold water, less detergent, a short cycle
1. Use cold water. Warm water opens up cotton fibres and lets dye escape.
2. Use about half the detergent you think you need — leftover detergent leaves a dull film on dark clothes.
3. Choose a short or quick cycle and a gentle spin.
4. Wash darks only with darks, and don't overfill the machine.

> tip: Wash new black or navy clothes on their own, or only with other darks, for the first two washes. That is when most of the loose dye comes out.

## 3. Dry in the shade, never in the dryer
Sunlight is the biggest enemy of dark cotton. In Bangladesh, a few afternoons on a sunny rooftop can visibly fade a black T-shirt. Dry darks inside out, in the shade or indoors under a fan. Tumble dryers fade colour too, and shrink cotton.

[fig everyday-crew-tee black | Dry darks inside out and in the shade: sun fades black faster than washing does.]

## 4. Wash less often
A T-shirt worn for a full hot day needs washing. A shirt worn for a few hours in air-conditioning may not. Airing clothes overnight and spot-cleaning small marks saves washes, and every wash you skip is colour you keep.

[products]

## What about salt and vinegar?
You will hear that soaking in salt or adding vinegar "sets" the dye. Modern factory dyes are already fixed, and there is little evidence that either trick helps much. Cold water, inside out and shade do the real work.

## When a dark has already faded
Fabric dyes can bring back faded black cotton, but results vary and it is easy to stain things. Often the better choice is to retire a faded tee to home wear and treat the next one well from day one. The same habits apply to polos — see [how to keep a polo shirt in shape](#/journal/how-to-keep-a-polo-shirt-in-shape) — and to jeans, in [how to wash raw denim](#/journal/how-to-wash-denim). Restock the basics in [T-shirts](#/c/tshirts).`}
];

/* ---------- Bengali twins (same slug, at /bn/journal/<slug>) ---------- */
var BF_BN = {
'how-to-keep-a-polo-shirt-in-shape':{
 title:'পোলো শার্টের শেপ ঠিক রাখার উপায়',
 dek:'ঠান্ডা পানিতে ধোয়া, ছায়ায় শুকানো আর ঝুলিয়ে না রেখে ভাঁজ করে রাখা — এই কয়েকটা অভ্যাসেই পোলো বছরের পর বছর নতুনের মতো থাকে।',
 quick:'পোলো উল্টো করে, বোতাম লাগিয়ে ঠান্ডা পানিতে (৩০°C বা তার কম) ধুয়ে নিন। ড্রায়ারে দেবেন না — ছায়ায় সমান করে বা মোটা হ্যাঙ্গারে শুকান। আলমারিতে ভাঁজ করে রাখুন, আর রিবের কলার কখনো ইস্ত্রি দিয়ে চেপে সমান করবেন না।',
 body:`ভালো পোলো এমনভাবেই বানানো হয় যেন এর শেপ ঠিক থাকে — কলার দাঁড়িয়ে থাকে, প্ল্যাকেট সমান থাকে, বডি সোজা ঝুলে থাকে। কয়েক মাসেই যেসব পোলো পুরনো দেখায়, সেগুলো আসলে পুরনো হয়নি — ভুলভাবে ধোয়া আর শুকানো হয়েছে। আমাদের [পিকে পোলো](#/c/polos)-র জন্য আমরা যে নিয়ম মানি, যেকোনো কটন পোলোতেই সেটা কাজ করবে।

## ধোয়ার আগে
প্ল্যাকেটের সব বোতাম লাগিয়ে নিন। খোলা প্ল্যাকেট মেশিনের ভেতর পেঁচিয়ে যায়, পরে সেখানেই ঢেউয়ের মতো ভাঁজ পড়ে। পোলো উল্টো করে নিন, তাহলে বাইরের দিকে ঘষা কম লাগবে — পিকে কাপড়ে ঘষা লাগলেই রোঁয়া ওঠে।

গাঢ় রঙের কাপড় গাঢ় রঙের সাথেই ধোবেন। নতুন নেভি বা কালো পোলো প্রথম দুই ধোয়ায় রং ছাড়তে পারে।

> tip: আগে কাপড়ের ভেতরের কেয়ার লেবেল দেখে নিন। ৩০°C লেখা থাকলে সেটাকেই সর্বোচ্চ ধরে নিন।

## কীভাবে ধোবেন
1. ঠান্ডা বা হালকা কুসুম গরম পানি দিন — ৩০°C বা তার কম। গরম পানিই পোলো ছোট হয়ে যাওয়া আর কলার কুঁকড়ে যাওয়ার মূল কারণ।
2. মেশিনে জেন্টল বা ডেলিকেট মোড দিন, স্পিন কম রাখুন। জোরে স্পিন দিলে ভেজা কলার টেনে লম্বা হয়ে যায়।
3. হালকা লিকুইড ডিটারজেন্ট দিন, ব্লিচ একদম না — সাদা পোলোতেও না।
4. মেশিন ঠেসে ভরবেন না। কাপড় নড়াচড়ার জায়গা না পেলে ভাঁজ আর প্যাঁচ নিয়ে বের হয়।

হাতে ধোয়া আরও ভালো: ঠান্ডা পানিতে একটু ডিটারজেন্ট দিয়ে ১৫ মিনিট ভিজিয়ে রাখুন, আলতো করে চাপ দিন — মোচড়াবেন না — তারপর পরিষ্কার পানি না আসা পর্যন্ত ধুয়ে ফেলুন।

## শুকানো: বেশিরভাগ পোলো এখানেই নষ্ট হয়
গরম ড্রায়ারে কটন পোলো কখনো দেবেন না। তাপে সুতা ছোট হয়ে যায়, রিবের কলার টাইট হয়ে বডি থেকে সরে আসে। ভেজা থাকতেই শেপ ঠিক করে নিন: কলার সোজা করুন, প্ল্যাকেট মিলিয়ে নিন, দুই পাশের সেলাই সমান করুন। তারপর তোয়ালের উপর সমান করে বা মোটা প্লাস্টিকের হ্যাঙ্গারে শুকান। চিকন তারের হ্যাঙ্গারে কাঁধে যে উঁচু দাগ পড়ে, তা ইস্ত্রিতেও যায় না।

রোদে না, ছায়ায় শুকান। ঢাকার দুপুরের কড়া রোদে এক মৌসুমেই নেভি, কালো আর লাল রং ফিকে হয়ে যায়। ছায়াওয়ালা বারান্দা বা ঘরের ফ্যানই যথেষ্ট — আর্দ্র আবহাওয়াতেও কয়েক ঘণ্টায় কটন পোলো শুকিয়ে যায়।

[fig essential-pique-polo navy | পোলো সমান করে বা মোটা হ্যাঙ্গারে শুকান, ভেজা থাকতেই কলার সোজা করে নিন।]

## কলার আর প্ল্যাকেট ইস্ত্রি
হালকা ভেজা থাকতে উল্টো দিক থেকে মাঝারি তাপে বডি ইস্ত্রি করুন। প্ল্যাকেট ভেতর থেকে চাপুন, তাহলে বোতামের দাগে চকচকে ভাব আসবে না। রিবের কলার ইস্ত্রি দিয়ে চেপে সমান করবেন না — এতে কলারের স্বাভাবিক ভাঁজ নষ্ট হয়। কুঁকড়ে গেলে হালকা স্টিম দিয়ে আঙুলে শেপ করে দিন।

[products]

## কীভাবে রাখবেন
সপ্তাহের পর সপ্তাহ ঝুলিয়ে না রেখে ভাঁজ করে রাখুন। নিটের কাপড় নিজের ওজনেই টেনে লম্বা হয়, ঝুলিয়ে রাখা পোলোর কাঁধ ঝুলে পড়ে। কলার উপরে রেখে তিন ভাঁজ করুন। বর্ষায় ড্রয়ারে সিলিকা জেলের প্যাকেট বা কয়েকটা নিমপাতা রাখুন — স্যাঁতসেঁতে ভাব আর পোকা দূরে থাকবে।

## কতবার ধোবেন?
বাংলাদেশের গরমে সারাদিন পরা পোলো একবার পরেই ধুয়ে ফেলুন — ঘাম জমে থাকলে কলার আর বগলের কাছে হলদে দাগ পড়ে। এসি অফিসে অল্প সময় পরলে রাতে হ্যাঙ্গারে বাতাসে রেখে আরেকবার পরা যায়।

> note: কেনার আগে সাইজ নিয়ে দ্বিধা? আগে পড়ে নিন [পোলো কেমন ফিট হওয়া উচিত](#/bn/journal/how-a-polo-should-fit)।`},
'how-a-polo-should-fit':{
 title:'পোলো শার্ট কেমন ফিট হওয়া উচিত: আয়নায় পাঁচটা পরীক্ষা',
 dek:'কাঁধ, হাতা, বুক, লম্বা আর কলার — আয়নার সামনে ৩০ সেকেন্ডেই বুঝবেন পোলোটা আপনার জন্য ঠিক কি না।',
 quick:'কাঁধের সেলাই কাঁধের হাড়ের ঠিক কিনারায় থাকবে, হাতা শেষ হবে বাইসেপের মাঝামাঝি আর ভেতরে এক আঙুল ঢুকবে। বুকের দুই পাশে ২–৩ সেমি কাপড় চিমটি দিয়ে ধরা যাবে। ইন না করলে নিচের প্রান্ত বেল্ট ঢেকে প্যান্টের চেইনের মাঝামাঝি পর্যন্ত আসবে।',
 body:`ফিট ঠিক থাকলে ৳৮৫০-এর পোলোও ঢিলেঢালা ৳৫,০০০-এর পোলোর চেয়ে ভালো দেখায়। সুখবর হলো, ফিট বোঝার জন্য মাত্র পাঁচটা জিনিস দেখলেই চলে — আয়নার সামনে ৩০ সেকেন্ডে।

## ১. কাঁধ
কাঁধের সেলাই বসবে কাঁধের হাড়ের ঠিক বাইরের কিনারায়। সেলাই হাতের দিকে নেমে গেলে পোলোটা বড় — যেভাবেই পরুন, অগোছালো লাগবে। আর কাঁধের উপরে উঠে থাকলে ছোট — সামনে হাত বাড়ালেই পিঠে টান লাগবে।

## ২. হাতা
হাতা শেষ হবে বাইসেপের মাঝামাঝি, হালকা করে বাহু ছুঁয়ে থাকবে। হাতার ভেতরে একটা আঙুল ঢুকিয়ে দেখুন: এক আঙুল ঢুকলে ঠিক আছে; পুরো হাত ঢুকে গেলে হাতা বেশি ঢিলা। কনুই পর্যন্ত লম্বা হাতায় বাহু ছোট দেখায়।

## ৩. বুক আর বডি
সোজা দাঁড়িয়ে বুকের পাশের কাপড় চিমটি দিয়ে ধরুন। প্রতি পাশে ২–৩ সেমি হলে রেগুলার ফিট, এর কম হলে স্লিম। অনেক বেশি হলে ইন করলে পেটের কাছে ফুলে থাকবে। বুক থেকে নিচ পর্যন্ত কাপড় সোজা ঝুলবে, বোতামের কাছে আড়াআড়ি টানের দাগ পড়বে না।

[fig essential-pique-polo white | কাঁধের সেলাই কাঁধের হাড়ে, হাতা বাইসেপের মাঝামাঝি, বুকে একটু জায়গা।]

## ৪. লম্বা
ইন না করে পরলে নিচের প্রান্ত বেল্ট ঢেকে প্যান্টের চেইনের মাঝামাঝি পর্যন্ত আসবে। পেছনের পকেট পুরো ঢেকে গেলে বাইরে রেখে পরার জন্য বেশি লম্বা। অফিসে ইন করে পরলে দুই-এক সেমি লম্বা হলেও সমস্যা নেই।

## ৫. কলার
দ্বিতীয় বোতাম পর্যন্ত লাগালে কলার গলার চারপাশে সমান হয়ে বসবে, পেছনে ফাঁক থাকবে না। কলার হাঁ হয়ে থাকলে সাধারণত কাঁধেও পোলোটা বড়।

> tip: অনলাইনে সাইজ বের করার সবচেয়ে সহজ উপায়: পছন্দের একটা পোলো সমান করে রেখে বগল থেকে বগল মাপুন, তারপর দ্বিগুণ করুন। সেই মাপ আমাদের [সাইজ গাইড](#/size-guide)-এর বুকের মাপের সাথে মিলিয়ে নিন।

## রেগুলার ফিট না স্লিম ফিট?
রেগুলার ফিটে বুক আর কোমরে জায়গা থাকে — গরমে আরাম, বেশিরভাগ শরীরে মানায়। স্লিম ফিট শরীরের সাথে লেগে থাকে; চিকন শরীরে দারুণ লাগে, তবে গরমের দিনে সব বোঝা যায়। দুই সাইজের মাঝামাঝি হলে রেগুলার ফিটে বড়টা আর স্লিম ফিটে ছোটটা নিন।

[products]

## তবুও ঠিক না হলে
সবার শরীর আলাদা, ব্র্যান্ডভেদে সাইজও আলাদা। পোলো হাতে পেয়ে কাঁধ বা লম্বা না মিললে সাইজ বদলে নিতে পারবেন — দেখুন আমাদের [এক্সচেঞ্জের নিয়ম](#/page/exchange)। আর সঠিক সাইজ পেলে সেটা ঠিক রাখতে পড়ুন [পোলো শার্টের শেপ ঠিক রাখার উপায়](#/bn/journal/how-to-keep-a-polo-shirt-in-shape)।`}
};

/* ---------- the demo guides as Blog-admin posts ----------
   94's zb_seeds() appends BLOG_EXTRA_SEEDS as published posts (post-store shape),
   so the shop reads them from zb_posts() like any other post and a reset brings
   them back. Bengali twins are separate posts with lang:'bn' and the SAME slug
   as their English post (pair = same slug, other language — traffic plan option A:
   /journal/<slug> ↔ /bn/journal/<slug>). Fields the store does not copy yet
   (combos, shop bar label, featured, pillar guide, brand guide) stay in BF_DEMO
   and the shop looks them up by slug. */
var BF_CODE = {suta:'A360-08', jotno:'A360-09', rong:'A360-10', ritu:'A360-11', bazar:'A360-12'};
var BF_PROOF = {suta:'jotno', jotno:'rong', rong:'suta', ritu:'bazar', bazar:'ritu'};   /* never the writer itself */
var BF_SECOF = {care:'Care', style:'Style', fabric:'Fabric', fit:'Size guide', season:'Winter', brand:'Behind EXTAS'};
var BLOG_EXTRA_SEEDS = (function(){
  var ts = function(d){ return Date.parse(d+'T09:00:00+06:00'); }, out = [];
  var links = function(body){ var l = [], re = /\]\((#\/[^)\s]+)\)/g, m; while((m = re.exec(body))){ if(l.indexOf(m[1]) < 0) l.push(m[1]); } return l; };
  BF_DEMO.forEach(function(d){
    var base = {slug:d.slug, kw:(d.tags||[])[0] || '', product:(d.products||[])[0] || '', products:(d.products||[]).slice(), color:d.img ? d.img[1] : '',
      section:BF_SECOF[d.pillar] || 'Style', pillar:d.pillar, sub:d.sub || '', tags:(d.tags||[]).slice(), heroImage:'',
      writer:d.author, proofer:BF_PROOF[d.author] || '', author:BF_CODE[d.author] || '', reviewer:BF_CODE[BF_PROOF[d.author]] || '', at:ts(d.date), updatedAt:ts(d.updated || d.date)};
    out.push(Object.assign({}, base, {id:'bx-'+d.slug, lang:'en', title:d.title, meta:d.dek, quickAnswer:d.quick, body:d.body, links:links(d.body)}));
    var bn = BF_BN[d.slug];
    if(bn) out.push(Object.assign({}, base, {id:'bx-'+d.slug+'-bn', lang:'bn', title:bn.title, meta:bn.dek, quickAnswer:bn.quick, body:bn.body, links:links(bn.body), kw:'পোলো', tags:(d.tags||[]).slice()}));
  });
  return out;
})();

/* =====================================================================
   ENGINE — words, data, ads
   ===================================================================== */
var BF = {route:'en', ul:'en', cache:null, tok:0, more:{}, focusFrom:-1, popShown:{}, barOff:false, ctx:null, scrollBound:false, io:null, used:{}};
var BF_PAGE = 8;          /* cards per "Load more" (8 + one house ad = three full rows on desktop) */

function bfL(k, v){
  var d = BF_T[BF.ul] || BF_T.en, s = d[k] != null ? d[k] : (BF_T.en[k] != null ? BF_T.en[k] : k);
  if(v) Object.keys(v).forEach(function(x){ s = s.split('{'+x+'}').join(v[x]); });
  return s;
}
function bfDig(n){ n = String(n); return BF.ul==='bn' ? n.replace(/[0-9]/g, function(c){ return String.fromCharCode(0x09E6 + Number(c)); }) : n; }
function bfMoney(n){ var s = fmt(n); return BF.ul==='bn' ? bfDig(s) : s; }
function bfDate(ts, lang){
  var d = new Date(ts); lang = lang || BF.ul;
  try{ if(lang==='bn') return d.toLocaleDateString('bn-BD', {day:'numeric', month:'long', year:'numeric'}); }catch(e){}
  return d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
}
function bfMonthName(key, lang){
  var p = key.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
  try{ if((lang||BF.ul)==='bn') return d.toLocaleDateString('bn-BD', {month:'long', year:'numeric'}); }catch(e){}
  return d.toLocaleDateString('en-GB', {month:'long', year:'numeric'});
}
function bfTs(v){ if(typeof v==='number') return v; var t = Date.parse(String(v||'') + (String(v||'').length===10 ? 'T09:00:00+06:00' : '')); return isNaN(t) ? 0 : t; }
function bfWords(s){ return String(s||'').replace(/\[(fig|products)[^\]]*\]/g,' ').trim().split(/\s+/).filter(Boolean).length; }
function bfMins(text, lang){ return Math.max(2, Math.round(bfWords(text) / (lang==='bn' ? 150 : 200))); }
function bfBase(lang){ return (lang || BF.route)==='bn' ? '#/bn/journal' : '#/journal'; }
function bfSlug(t){ return typeof hm_journalSlug==='function' ? hm_journalSlug({t:t}) : String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48); }
function bfTagName(t){ return String(t).replace(/-/g, ' '); }

/* ---------- pillars ---------- */
/* the owner's categories (ST.blogPillars, set in the Blog admin) win; our intros fill gaps */
function bfPillars(){
  var st = null; try{ if(typeof zb_pillars==='function') st = zb_pillars(); }catch(e){}
  if(!st || !st.length) st = (typeof ST!=='undefined' && ST && Array.isArray(ST.blogPillars) && ST.blogPillars.length) ? ST.blogPillars : null;
  if(!st) return BF_PILLARS;
  return st.filter(function(p){ return !p.hidden; }).map(function(p){
    var mine = BF_PILLARS.filter(function(x){ return x.id===p.id; })[0] || {};
    return {id:p.id, en:p.en || mine.en || p.id, bn:p.bn || mine.bn || p.en, intro:p.intro || mine.intro || '', introBn:p.introBn || mine.introBn || '',
      subs:(p.subs||[]).filter(function(s){ return !s.hidden; }).map(function(s){ return Array.isArray(s) ? s : [s.id, s.en || s.id, s.bn || s.en]; }), shop:mine.shop || ['polos','Polos','পোলো']};
  });
}
function bfPillar(id){ var l = bfPillars(); for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; }
function bfPName(id, lang){ var p = bfPillar(id); return p ? ((lang||BF.ul)==='bn' ? p.bn : p.en) : ''; }
function bfSubName(pid, sid, lang){ var p = bfPillar(pid); if(!p) return ''; for(var i=0;i<p.subs.length;i++) if(p.subs[i][0]===sid) return (lang||BF.ul)==='bn' ? p.subs[i][2] : p.subs[i][1]; return ''; }

/* ---------- authors (ST.blogAuthors, PR 593) ---------- */
function bfAuthors(){ var a = (typeof ST!=='undefined' && ST && Array.isArray(ST.blogAuthors) && ST.blogAuthors.length) ? ST.blogAuthors : BLOG_AUTHORS_SEED; return a; }
function bfAuthor(id){ var a = bfAuthors(); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }
function bfAuthorFor(pillar){
  var a = bfAuthors();
  for(var i=0;i<a.length;i++){ if(a[i].pillar===pillar || (a[i].pillars||[]).indexOf(pillar)>=0) return a[i]; }
  if(pillar==='fit'){ for(var j=0;j<a.length;j++) if(a[j].pillar==='fabrics') return a[j]; }
  return a[0] || null;
}
var BF_TEAM = {id:'', name:'EXTAS team', bn:'EXTAS টিম', pillar:'', col:'#171715', team:true};
function bfByline(){ return (typeof ST!=='undefined' && ST && ST.blogByline) || {}; }
function bfReviewer(a){ return (a && a.reviewer) || bfByline().reviewedBy || ''; }
function bfAName(a, lang){ return a ? (((lang||BF.ul)==='bn' && a.bn) ? a.bn : a.name) : ''; }
function bfAvatar(a, size){
  size = size || 44; if(!a) return '';
  var col = a.col || BF_PCOL[a.pillar] || '#1F4E46';
  if(a.photo && /^(https?:|data:image)/.test(String(a.photo))) return '<span class="bf-av" style="width:'+size+'px;height:'+size+'px"><img src="'+esc(a.photo)+'" alt="" loading="lazy" decoding="async"></span>';
  var ch = a.team ? 'E' : String(a.name||'?').charAt(0).toUpperCase();
  return '<span class="bf-av" aria-hidden="true" style="width:'+size+'px;height:'+size+'px;background:'+col+';font-size:'+Math.round(size*0.42)+'px">'+esc(ch)+'</span>';
}

/* ---------- posts: ONLY from the Blog admin store ----------
   zb_posts() (status published) when 94 is loaded, else DB.journal. The demo
   guides arrive the same way (BLOG_EXTRA_SEEDS → zb_seeds()). A Bengali post with
   the same slug as an English one is its twin (/bn/journal/<slug>). */
function bfAdminRaw(){
  try{ if(typeof zb_posts==='function') return zb_posts().filter(function(p){ return p.status==='published'; }); }catch(e){}
  return (DB.journal || []).map(function(a, i){ return {id:a.id || 'j'+i, title:a.title || a.t, slug:a.slug, meta:a.meta || a.x, body:a.body || a.x, lang:a.lang || 'en', status:'published',
    at:a.at || Date.now() - (i+1)*86400000*3, updatedAt:a.updatedAt, product:a.p, products:a.products, color:a.c, section:String(a.e||'').split(' · ')[0], pillar:a.pillar, sub:a.sub,
    tags:a.tags, quickAnswer:a.quickAnswer, writer:a.writer, demo:a.demo}; });
}
function bfEdited(id){ try{ return !!(typeof zb_st==='function' && zb_st().posts[id]); }catch(e){ return false; } }
var BF_XTRA = {}; BF_DEMO.forEach(function(d){ BF_XTRA[d.slug] = d; });
function bfFromAdmin(p){
  var slug = p.slug || bfSlug(p.title), sec = BF_SEC[p.section] || ['style','casual'], sm = BF_SEEDMAP[slug];
  var seedUntouched = /^j\d+$/.test(String(p.id)) && !bfEdited(p.id);
  var pillar = (sm && seedUntouched) ? sm[0] : (p.pillar || (sm ? sm[0] : sec[0])), sub = (sm && seedUntouched) ? sm[1] : (p.sub || (sm ? sm[1] : sec[1]));
  var body = String(p.body || ''), meta = String(p.meta || ''), x = BF_XTRA[slug] || {}, prods = (p.products && p.products.length ? p.products : [p.product]).filter(function(id){ return id && P(id); });
  var tags = (p.tags && p.tags.length) ? p.tags : (sm ? sm[2] : [pillar]);
  return {id:p.id, slug:slug, lang:p.lang==='bn' ? 'bn' : 'en', title:p.title || 'Untitled', dek:meta || body.slice(0, 160), quick:p.quickAnswer || '', body:body,
    pillar:pillar, sub:sub, tags:tags.map(function(t){ return String(t).trim().toLowerCase().replace(/\s+/g, '-'); }), date:p.at || Date.now(), updated:p.updatedAt ? bfTs(p.updatedAt) : (p.at || Date.now()),
    writer:p.writer || '', img:[prods[0] || 'essential-pique-polo', p.color || ''], products:prods, combos:x.combos || p.combos || [], shop:x.shop || null,
    featured:!!(p.featured || x.featured), guide:!!(p.guide || x.guide), brand3p:!!(p.brand3p || x.brand3p), thin:bfWords(body) < 120, demo:!!p.demo, src:'admin'};
}
function bfAll(){
  if(BF.cache) return BF.cache;
  var en = [], bn = [], bySlug = {};
  bfAdminRaw().forEach(function(raw){ var n = bfFromAdmin(raw); (n.lang==='bn' ? bn : en).push(n); });
  en.forEach(function(p){ if(!bySlug[p.slug]) bySlug[p.slug] = p; });
  var list = en.slice();
  bn.forEach(function(b){ var twin = bySlug[b.slug]; if(twin && !twin.bn){ twin.bn = b; } else list.push(b); });   /* a twin rides on its English post; a Bengali-only post stands alone */
  /* author = the writer agent (PR 593), or the EXTAS team for the owner's own posts; "Reviewed by" = the real
     staff reviewer the owner names (author.reviewer or ST.blogByline.reviewedBy) — never an AI proofreader's code */
  list.forEach(function(p){
    var a = (!p.writer || p.writer==='owner') ? BF_TEAM : (bfAuthor(p.writer) || bfAuthorFor(p.pillar) || BF_TEAM);
    p.authorObj = a; p.author = a.team ? '' : a.id; p.reviewer = bfReviewer(a.team ? null : a);
  });
  list.sort(function(a, b){ return b.date - a.date; });
  BF.cache = list; return list;
}
function bfFind(slug){
  var all = bfAll();
  for(var i=0;i<all.length;i++) if(all[i].slug===slug) return all[i];
  for(var j=0;j<all.length;j++) if(bfSlug(all[j].title)===slug) return all[j];   /* the admin's "View" link builds the slug from the title */
  return null;
}
/* English pages list every post (a Bengali-only one wears a বাংলা tag); Bengali pages list the posts that have Bengali text */
function bfList(){ var all = bfAll(); return BF.route==='bn' ? all.filter(function(p){ return p.lang==='bn' || p.bn; }) : all; }
function bfV(p, lang){
  lang = lang || BF.route;
  if(lang==='bn' && p.bn) return {lang:'bn', title:p.bn.title, dek:p.bn.dek, quick:p.bn.quick, body:p.bn.body, mins:bfMins(p.bn.body, 'bn'), twin:true};
  return {lang:p.lang, title:p.title, dek:p.dek, quick:p.quick, body:p.body, mins:bfMins(p.body, p.lang), twin:p.lang==='en' && !!p.bn};
}
function bfHref(p, lang){ lang = lang || BF.route; return ((lang==='bn' && p.bn) || p.lang==='bn') ? '#/bn/journal/'+p.slug : '#/journal/'+p.slug; }
function bfFeatured(list){ var f = list.filter(function(p){ return p.featured; })[0]; return f || list[0] || null; }
function bfGuide(pillar, list){ var g = list.filter(function(p){ return p.pillar===pillar && p.guide; }); return g[0] || null; }

/* ---------- house ads (PR 592, shared contract ST.blogAds) ---------- */
function bfAds(){ return (typeof ST!=='undefined' && ST && Array.isArray(ST.blogAds)) ? ST.blogAds : BLOG_ADS_SEED; }
function bfAdSet(){ var s = {}; Object.keys(BLOG_AD_SETTINGS_SEED).forEach(function(k){ s[k] = BLOG_AD_SETTINGS_SEED[k]; }); var o = (typeof ST!=='undefined' && ST && ST.blogAdSettings) || {}; Object.keys(o).forEach(function(k){ s[k] = o[k]; }); return s; }
function bfAdLive(ad){
  if(!ad || ad.active===false) return false;
  var now = Date.now(), st = bfTs(ad.start), en = bfTs(ad.end);
  if(st && now < st) return false; if(en && now > en + 86399000) return false;
  if(ad.type==='product'){ var p = P(ad.productId); if(!p) return false; }
  if(ad.type==='combo'){ var c = typeof COMBO==='function' ? COMBO(ad.comboId) : null; if(!c || c.active===false) return false; }
  if(ad.type==='category'){ if(!CAT(ad.catId)) return false; }
  return true;
}
function bfAdFits(ad, slot, ctx){
  if((ad.slots||[]).indexOf(slot) < 0) return false;
  if(ad.posts && ad.posts.length){ if(!ctx.slug || ad.posts.indexOf(ctx.slug) < 0) return false; }
  if(ad.pillars && ad.pillars.length && ctx.pillar && ad.pillars.indexOf(ctx.pillar) < 0) return false;
  return true;
}
function bfHash(s){ var h = 2166136261; for(var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
/* one ad for a slot: live + dates + post/pillar match, then weight; an ad
   already on this page is used again only when nothing else is left */
function bfPick(slot, ctx, n){
  var src = bfAds(), pool;
  /* post-bar is a front-end slot until the Blog admin lists it: if no stored ad uses it, the seed's bar shows */
  if(slot==='post-bar' && !src.some(function(a){ return (a.slots||[]).indexOf('post-bar')>=0; })) pool = BLOG_ADS_SEED.filter(function(a){ return bfAdLive(a) && bfAdFits(a, slot, ctx); });
  else if(typeof zb_adsFor==='function'){ try{ pool = zb_adsFor(slot, {pillar:ctx.pillar, slug:ctx.slug}).filter(function(a){ return bfAdLive(a) && (!/^(home|cat)-/.test(slot) || !(a.posts && a.posts.length)); }); }catch(e){ pool = null; } }
  if(!pool) pool = src.filter(function(a){ return bfAdLive(a) && bfAdFits(a, slot, ctx); });
  if(!pool.length) return null;
  var fresh = pool.filter(function(a){ return !BF.used[a.id]; }); if(fresh.length) pool = fresh;
  var tot = pool.reduce(function(s, a){ return s + Math.max(0.1, Number(a.weight)||1); }, 0);
  var r = bfHash(slot+'|'+(ctx.key||'')+'|'+(n||0)) * tot;
  for(var i=0;i<pool.length;i++){ r -= Math.max(0.1, Number(pool[i].weight)||1); if(r <= 0){ BF.used[pool[i].id] = 1; return pool[i]; } }
  BF.used[pool[pool.length-1].id] = 1; return pool[pool.length-1];
}
function bfImgKey(key, ratio){
  key = String(key||''); var cls = 'bf-adimg '+(ratio||'ratio-11');
  if(/^(https?:|data:image)/.test(key)) return '<div class="pimg '+cls+'"><img src="'+esc(key)+'" alt="" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></div>';
  var parts = key.split(':'), p = P(parts[0]); if(!p) return '<div class="pimg '+cls+'" style="background:var(--brand-tint)"></div>';
  return productImg(p, parts[1] && p.colors.indexOf(parts[1])>=0 ? parts[1] : p.colors[0], {ratio:cls, label:false});
}
function bfComboImg(c, ratio){
  var seen = {}, items = (c.items||[]).map(function(id){ var p = P(id); if(!p) return null; var k = seen[id] = (seen[id]||0) + 1; return {product:id, color:p.colors[(k-1) % p.colors.length]}; }).filter(Boolean);
  return setImg(items, {ratio:'bf-adimg '+(ratio||'ratio-11')}).replace(/<span class="pimg-label">[^<]*<\/span>/, '');
}
/* what an ad shows, whatever its type */
function bfAdView(ad, ratio){
  var v = {id:ad.id, title:ad.title||'', sub:ad.sub||'', cta:ad.cta||bfL('view'), href:ad.link||'#/', img:'', price:'', add:null};
  if(ad.type==='product'){ var p = P(ad.productId); v.title = ad.title || p.name; v.sub = ad.sub || p.fabric || ''; v.href = ad.link || '#/p/'+p.id; v.img = productImg(p, p.colors[0], {ratio:'bf-adimg '+(ratio||'ratio-11'), label:false}); v.price = bfMoney(p.price); v.add = {pid:p.id, color:p.colors[0]}; v.cta = bfL('add'); }
  else if(ad.type==='combo'){ var c = COMBO(ad.comboId), single = (c.items||[]).reduce(function(s, id){ var q = P(id); return s + (q ? q.price : 0); }, 0);
    v.title = ad.title || c.name; v.sub = ad.sub || c.blurb || ''; v.href = ad.link || '#/combo/'+c.id; v.img = bfComboImg(c, ratio); v.price = bfMoney(c.price) + (single > c.price ? ' <span class="bf-save">'+esc(bfL('save', {x:bfMoney(single - c.price)}))+'</span>' : ''); v.cta = ad.cta || bfL('chooseCol'); }
  else if(ad.type==='category'){ var cat = CAT(ad.catId), ps = DB.products.filter(function(x){ return x.cat===cat.id; }), min = ps.reduce(function(m, x){ return Math.min(m, x.price); }, Infinity);
    v.title = ad.title || t(cat.name); v.sub = ad.sub || (isFinite(min) ? bfL('fromP', {x:bfMoney(min)}) : ''); v.href = ad.link || '#/c/'+cat.id; v.img = ps[0] ? productImg(ps[0], ps[0].colors[0], {ratio:'bf-adimg '+(ratio||'ratio-11'), label:false}) : ''; }
  else { v.img = ad.img ? bfImgKey(ad.img, ratio) : ad.productId && P(ad.productId) ? bfImgKey(ad.productId, ratio) : ad.catId ? bfImgKey((DB.products.filter(function(x){ return x.cat===ad.catId; })[0]||{}).id, ratio) : bfImgKey('', ratio); }
  return v;
}
/* one ad in one slot. kind: wide (banners, in-article, end) · card (grid) · slim (under the quick answer) · side (desktop sidebar) */
function bfAdHTML(ad, slot, kind){
  if(!ad) return '';
  var v = bfAdView(ad, kind==='card' ? 'bf-r32' : kind==='side' ? 'ratio-wide' : 'ratio-11');
  var lab = '<span class="bf-adlab">'+esc(bfL('adLabel'))+'</span>';
  var data = ' data-bf-ad="'+esc(ad.id)+'" data-bf-slot="'+esc(slot)+'"';
  var cta = v.add
    ? '<button type="button" class="btn btn-primary bf-adcta" data-act="bf-add" data-id="'+esc(v.add.pid)+'" data-color="'+esc(v.add.color)+'"><span class="bf-full">'+esc(bfL('add'))+'</span><span class="bf-short">'+esc(bfL('addShort'))+'</span></button>'
    : '<a class="btn btn-secondary bf-adcta" href="'+esc(v.href)+'">'+esc(v.cta)+'</a>';
  var price = v.price ? '<div class="bf-adprice">'+v.price+'</div>' : '';
  var img = '<a class="bf-adimg-a" href="'+esc(v.href)+'" tabindex="-1" aria-hidden="true">'+v.img+'</a>';
  return '<aside class="bf-ad bf-ad-'+kind+'" aria-label="'+esc(bfL('adLabel'))+'"'+data+'>'+img+
    '<div class="bf-adb">'+lab+'<a class="bf-adt bf-stretch" href="'+esc(v.href)+'">'+esc(v.title)+'</a>'+(v.sub && kind!=='slim' ? '<p class="bf-ads">'+esc(v.sub)+'</p>' : '')+price+
    '<div class="bf-adact">'+cta+'</div></div></aside>';
}
function bfSlot(slot, ctx, kind, n){ return bfAdHTML(bfPick(slot, ctx, n), slot, kind); }
function bfAdStat(id, slot, k){
  try{ if(!ST.blogAdStats) ST.blogAdStats = {}; var key = id+'|'+slot, s = ST.blogAdStats[key] || (ST.blogAdStats[key] = {v:0, c:0}); s[k] = (s[k]||0) + 1; }catch(e){}
}
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('[data-bf-ad] a, [data-bf-ad] button'); if(!a) return;
  var box = a.closest('[data-bf-ad]'); bfAdStat(box.getAttribute('data-bf-ad'), box.getAttribute('data-bf-slot'), 'c'); try{ saveState(); }catch(err){}
}, true);

/* =====================================================================
   RENDER — shared pieces
   ===================================================================== */
function bfInline(s){
  return esc(s).replace(/\[([^\]]+)\]\((#[^)\s]+)\)/g, '<a class="bf-il" href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
/* body markup → blocks (see the note above BF_DEMO) */
function bfBlocks(src){
  var out = [], lines = String(src||'').replace(/\r/g,'').split('\n'), para = [];
  var flush = function(){ if(para.length){ out.push({t:'p', s:para.join(' ')}); para = []; } };
  for(var i=0;i<lines.length;i++){
    var L = lines[i].trim(), m;
    if(!L){ flush(); continue; }
    if((m = L.match(/^##\s+(.+)/)) && !/^###/.test(L)){ flush(); out.push({t:'h2', s:m[1]}); continue; }
    if((m = L.match(/^###\s+(.+)/))){ flush(); out.push({t:'h3', s:m[1]}); continue; }
    if((m = L.match(/^>\s*(tip|note):\s*(.+)/i))){ flush(); out.push({t:'box', k:m[1].toLowerCase(), s:m[2]}); continue; }
    if((m = L.match(/^\[fig\s+([\w-]+)\s+([\w-]+)\s*\|\s*(.+)\]$/))){ flush(); out.push({t:'fig', p:m[1], c:m[2], s:m[3]}); continue; }
    if(/^\[products\]$/.test(L)){ flush(); out.push({t:'products'}); continue; }
    if((m = L.match(/^\d+\.\s+(.+)/))){ flush(); var last = out[out.length-1]; if(last && last.t==='ol') last.items.push(m[1]); else out.push({t:'ol', items:[m[1]]}); continue; }
    if((m = L.match(/^-\s+(.+)/))){ flush(); var l2 = out[out.length-1]; if(l2 && l2.t==='ul') l2.items.push(m[1]); else out.push({t:'ul', items:[m[1]]}); continue; }
    para.push(L);
  }
  flush(); return out;
}
function bfCrumbs(items){
  return '<nav class="bf-crumbs" aria-label="'+esc(bfL('breadcrumb'))+'"><ol>'+items.map(function(it, i){
    var last = i === items.length - 1;
    return '<li>'+(last && !it[1] ? '<span aria-current="page">'+esc(it[0])+'</span>' : '<a href="'+esc(it[1])+'">'+esc(it[0])+'</a>')+'</li>';
  }).join('')+'</ol></nav>';
}
function bfHeroImg(p, ratio, label){
  var pr = P(p.img && p.img[0]) || P('essential-pique-polo'), col = (p.img && pr.colors.indexOf(p.img[1])>=0) ? p.img[1] : pr.colors[0];
  return productImg(pr, col, {ratio:ratio, label:label===true ? undefined : false, labelText:'[ demo · garment drawing ]'});
}
function bfMeta(p, v){
  return '<div class="bf-meta"><span>'+esc(bfL('minShort', {n:bfDig(v.mins)}))+'</span><span aria-hidden="true">·</span><time datetime="'+new Date(p.date).toISOString().slice(0,10)+'">'+esc(bfDate(p.date))+'</time></div>';
}
function bfCard(p, i){
  var v = bfV(p);
  var flag = (BF.route!=='bn' && p.lang==='bn') ? '<span class="bf-flag" lang="bn">বাংলা</span>' : (p.demo ? '<span class="bf-flag">'+esc(bfL('demo'))+'</span>' : '');
  return '<article class="bf-card" data-i="'+(i||0)+'"><a class="bf-card-a" href="'+bfHref(p)+'">'+
    '<div class="bf-card-img">'+bfHeroImg(p, 'bf-r32')+'</div>'+
    '<div class="bf-card-b"><div class="bf-card-top"><span class="bf-pl">'+esc(bfPName(p.pillar))+'</span>'+flag+'</div>'+
    '<h3 class="bf-card-t"'+(v.lang==='bn'?' lang="bn"':'')+'>'+esc(v.title)+'</h3>'+bfMeta(p, v)+'</div></a></article>';
}
function bfChips(active){
  var b = bfBase();
  var chip = function(href, label, on){ return '<a class="bf-chip'+(on?' on':'')+'" href="'+href+'"'+(on?' aria-current="page"':'')+'>'+esc(label)+'</a>'; };
  return '<nav class="bf-cats" aria-label="'+esc(bfL('cats'))+'"><div class="bf-chiprow">'+chip(b, bfL('all'), !active)+
    bfPillars().map(function(p){ return chip(b+'/topic/'+p.id, BF.ul==='bn' ? p.bn : p.en, active===p.id); }).join('')+'</div></nav>';
}
function bfSearchForm(q){
  return '<form class="bf-search" role="search" data-submit="bf-search"><label class="bf-sr" for="bf-q">'+esc(bfL('searchLabel'))+'</label>'+
    '<input id="bf-q" name="q" type="search" class="input" value="'+esc(q||'')+'" placeholder="'+esc(bfL('searchPh'))+'" autocomplete="off" enterkeyhint="search">'+
    '<button class="btn btn-primary bf-search-b" aria-label="'+esc(bfL('search'))+'">'+ico('search',18)+'<span class="bf-full">'+esc(bfL('search'))+'</span></button></form>';
}
function bfLangLink(toBn, href){
  return toBn ? '<a class="bf-langl" href="'+href+'" hreflang="bn" lang="bn">বাংলা</a>' : '<a class="bf-langl" href="'+href+'" hreflang="en" lang="en">English</a>';
}
/* list-page header: crumbs, one h1, intro, search, RSS, language twin */
function bfHead(crumbs, h1, dek, opts){
  opts = opts || {};
  var tools = '<div class="bf-hd-tools">'+(opts.search!==false ? bfSearchForm(opts.q) : '')+
    '<div class="bf-hd-links"><a class="bf-rss" href="'+bfBase()+'/rss">'+ico('globe',16)+esc(bfL('rss'))+'</a>'+(opts.lang||'')+'</div></div>';
  return '<header class="bf-hd">'+bfCrumbs(crumbs)+'<div class="bf-hd-row"><div class="bf-hd-t">'+(opts.eyebrow||'')+'<h1 class="bf-h1">'+esc(h1)+'</h1>'+(dek ? '<p class="bf-dek">'+esc(dek)+'</p>' : '')+'</div>'+tools+'</div></header>';
}
/* the post grid with house ads every N cards, and "Load more" (not infinite scroll) */
function bfGrid(list, key, ctx){
  var n = BF.more[key] || BF_PAGE, set = bfAdSet(), every = Math.max(2, Number(set.gridEvery)||6), h = '', k = 0;
  if(!list.length) return '<p class="bf-empty">'+esc(bfL('emptyList'))+'</p>';
  list.slice(0, n).forEach(function(p, i){
    h += bfCard(p, i);
    if((i+1) % every === 0 && i+1 < Math.min(n, list.length)) h += '<div class="bf-gridad">'+bfSlot('home-grid', ctx, 'card', k++)+'</div>';
  });
  var more = list.length > n ? '<div class="bf-more"><p class="bf-more-c">'+esc(bfL('showing', {a:bfDig(n), b:bfDig(list.length)}))+'</p><button type="button" class="btn btn-secondary bf-more-b" data-act="bf-more" data-k="'+esc(key)+'" data-n="'+n+'">'+esc(bfL('loadMore'))+'</button></div>' : '';
  return '<div class="bf-grid">'+h+'</div>'+more;
}
function bfShopStrip(cats){
  cats = cats || ['polos','tshirts','shirts','panjabi','trousers','hoodies'];
  var tile = function(href, label, p){ return '<a class="bf-shop-t" href="'+href+'">'+(p ? productImg(p, p.colors[0], {ratio:'ratio-11', label:false}) : '')+'<span>'+esc(label)+'</span></a>'; };
  var tiles = cats.map(function(id){ var c = CAT(id); if(!c) return ''; var p = DB.products.filter(function(x){ return x.cat===id; })[0]; return tile('#/c/'+id, t(c.name), p); }).join('') +
    tile('#/combos', BF.ul==='bn' ? 'সেট ও কম্বো' : 'Sets & combos', P('ct-polo-trio') || P('essential-pique-polo'));
  return '<section class="bf-shop" aria-labelledby="bf-shop-h"><h2 class="bf-h2" id="bf-shop-h">'+esc(bfL('shopLook'))+'</h2><div class="bf-shoprow">'+tiles+'</div></section>';
}
function bfNews(src, compact){
  var done = UI['bf-news:'+src];
  if(done) return '<section class="bf-news'+(compact?' compact':'')+'" aria-live="polite"><div class="bf-news-ok">'+ico('check',20)+'<span>'+esc(bfL('newsOk'))+'</span></div></section>';
  var err = UI['bf-news-err:'+src];
  return '<section class="bf-news'+(compact?' compact':'')+'" aria-labelledby="bf-news-h-'+src+'"><div class="bf-news-t"><h2 class="bf-h2" id="bf-news-h-'+src+'">'+esc(bfL('newsH'))+'</h2><p>'+esc(bfL('newsP'))+'</p></div>'+
    '<form class="bf-news-f" data-submit="bf-news" data-src="'+esc(src)+'" novalidate><label class="bf-news-l" for="bf-news-i-'+src+'">'+esc(bfL('newsLabel'))+'</label>'+
    '<div class="bf-news-row"><input id="bf-news-i-'+src+'" name="v" class="input" type="text" inputmode="email" autocomplete="email"'+(err?' aria-invalid="true" aria-describedby="bf-news-e-'+src+'"':'')+'>'+
    '<button class="btn btn-primary">'+esc(bfL('newsBtn'))+'</button></div>'+(err ? '<p class="bf-news-e" id="bf-news-e-'+src+'" role="alert">'+esc(bfL('newsErr'))+'</p>' : '')+'</form></section>';
}
function bfBrowse(){
  var list = bfList(), tags = {}, months = {};
  list.forEach(function(p){ (p.tags||[]).forEach(function(tg){ tags[tg] = (tags[tg]||0) + 1; }); var k = new Date(p.date).toISOString().slice(0,7); months[k] = (months[k]||0) + 1; });
  var top = Object.keys(tags).sort(function(a,b){ return tags[b]-tags[a] || a.localeCompare(b); }).slice(0, 12);
  var mk = Object.keys(months).sort().reverse();
  var b = bfBase();
  return '<section class="bf-browse" aria-labelledby="bf-browse-h"><h2 class="bf-h2" id="bf-browse-h">'+esc(bfL('browse'))+'</h2><div class="bf-browse-g">'+
    '<div><h3 class="bf-h3">'+esc(bfL('tagsH'))+'</h3><div class="bf-tagrow wrap">'+top.map(function(tg){ return '<a class="bf-tag" href="'+b+'/tag/'+tg+'">#'+esc(bfTagName(tg))+'</a>'; }).join('')+'</div></div>'+
    '<div><h3 class="bf-h3">'+esc(bfL('archive'))+'</h3><ul class="bf-rows">'+mk.map(function(k){ return '<li><a href="'+b+'/archive/'+k+'"><span>'+esc(bfMonthName(k))+'</span><span class="bf-cnt">'+bfDig(months[k])+'</span></a></li>'; }).join('')+'</ul></div>'+
    '<div><h3 class="bf-h3">'+esc(bfL('authors'))+'</h3><ul class="bf-rows">'+bfAuthors().map(function(a){ return '<li><a href="'+b+'/author/'+a.id+'">'+bfAvatar(a, 28)+'<span class="grow">'+esc(bfAName(a))+'</span><span class="bf-cnt">'+esc(bfPName(a.pillar))+'</span></a></li>'; }).join('')+'</ul></div>'+
  '</div></section>';
}
function bfABio(a){
  var seed = BLOG_AUTHORS_SEED.filter(function(x){ return x.id===a.id; })[0] || {};
  return BF.ul==='bn' ? (a.bioBn || seed.bioBn || a.bio || '') : (a.bio || seed.bio || '');
}
function bfHonest(){ var b = bfByline(); return BF.ul==='bn' ? (b.note || bfL('honest')) : (b.noteEn || bfL('honest')); }
function bfNoBnNote(){ return BF.route==='bn' ? '<p class="bf-bnnote">'+esc(bfL('moreBn'))+' <a href="#/journal">'+esc(bfL('allEn'))+'</a></p>' : ''; }

/* =====================================================================
   PAGES
   ===================================================================== */
function bfHome(q){
  var list = bfList(), f = bfFeatured(list), rest = list.filter(function(p){ return p !== f; }), ctx = {key:'home'};
  var fv = f ? bfV(f) : null;
  var feat = f ? '<article class="bf-feat"><a class="bf-feat-a" href="'+bfHref(f)+'"><div class="bf-feat-img">'+bfHeroImg(f, 'ratio-wide')+'</div>'+
    '<div class="bf-feat-b"><div class="bf-card-top"><span class="bf-pl">'+esc(bfL('feat'))+' · '+esc(bfPName(f.pillar))+'</span>'+(f.demo?'<span class="bf-flag">'+esc(bfL('demo'))+'</span>':'')+'</div>'+
    '<h2 class="bf-feat-t"'+(fv.lang==='bn'?' lang="bn"':'')+'>'+esc(fv.title)+'</h2><p class="bf-feat-d"'+(fv.lang==='bn'?' lang="bn"':'')+'>'+esc(fv.dek)+'</p>'+bfMeta(f, fv)+'</div></a></article>' : '';
  return '<div class="container bf-page" data-bf="home">'+
    bfHead([[bfL('home'), '#/'], [bfL('journalShort'), '']], bfL('journal'), bfL('dek'), {lang:BF.route==='bn' ? bfLangLink(false, '#/journal') : bfLangLink(true, '#/bn/journal')})+
    bfChips(null)+
    '<div class="bf-top">'+bfSlot('home-top', ctx, 'wide')+'</div>'+
    feat+
    '<section class="bf-sec" aria-labelledby="bf-latest-h"><div class="bf-sechd"><h2 class="bf-h2" id="bf-latest-h">'+esc(bfL('latest'))+'</h2><span class="bf-cnt">'+esc(rest.length===1 ? bfL('post1') : bfL('posts', {n:bfDig(rest.length)}))+'</span></div>'+
      bfGrid(rest, 'home', ctx)+bfNoBnNote()+'</section>'+
    bfNews('home')+bfBrowse()+bfShopStrip()+
  '</div>';
}
function bfTopic(pid, sid){
  var pil = bfPillar(pid); if(!pil) return bfNotFound();
  var all = bfList().filter(function(p){ return p.pillar===pid; }), list = sid ? all.filter(function(p){ return p.sub===sid; }) : all;
  var guide = bfGuide(pid, list), rest = list.filter(function(p){ return p !== guide; }), ctx = {key:'topic-'+pid+'-'+(sid||''), pillar:pid};
  var b = bfBase(), name = BF.ul==='bn' ? pil.bn : pil.en, subName = sid ? bfSubName(pid, sid) : '';
  var subsWith = pil.subs.filter(function(s){ return all.some(function(p){ return p.sub===s[0]; }); });
  var subs = subsWith.length ? '<nav class="bf-subs" aria-label="'+esc(bfL('inSub'))+'"><div class="bf-chiprow sm">'+
    '<a class="bf-chip sm'+(!sid?' on':'')+'" href="'+b+'/topic/'+pid+'"'+(!sid?' aria-current="page"':'')+'>'+esc(bfL('inCat', {p:name}))+'</a>'+
    subsWith.map(function(s){ var on = s[0]===sid; return '<a class="bf-chip sm'+(on?' on':'')+'" href="'+b+'/topic/'+pid+'/'+s[0]+'"'+(on?' aria-current="page"':'')+'>'+esc(BF.ul==='bn' ? s[2] : s[1])+'</a>'; }).join('')+'</div></nav>' : '';
  var gv = guide ? bfV(guide) : null;
  var pin = guide ? '<section class="bf-pin" aria-label="'+esc(bfL('pillarGuide'))+'"><a class="bf-pin-a" href="'+bfHref(guide)+'"><div class="bf-pin-img">'+bfHeroImg(guide, 'bf-r32')+'</div>'+
    '<div class="bf-pin-b"><span class="bf-pinlab">'+ico('star',14)+esc(bfL('startHere'))+' · '+esc(bfL('pillarGuide'))+'</span><h2 class="bf-pin-t"'+(gv.lang==='bn'?' lang="bn"':'')+'>'+esc(gv.title)+'</h2><p class="bf-pin-d"'+(gv.lang==='bn'?' lang="bn"':'')+'>'+esc(gv.dek)+'</p>'+bfMeta(guide, gv)+'</div></a></section>' : '';
  var crumbs = [[bfL('home'), '#/'], [bfL('journalShort'), b]].concat(sid ? [[name, b+'/topic/'+pid], [subName, '']] : [[name, '']]);
  return '<div class="container bf-page" data-bf="topic">'+
    bfHead(crumbs, sid ? subName : name, BF.ul==='bn' ? pil.introBn : pil.intro, {})+
    bfChips(pid)+subs+
    '<div class="bf-top">'+bfSlot('cat-top', ctx, 'wide')+'</div>'+pin+
    '<section class="bf-sec" aria-labelledby="bf-tl-h"><div class="bf-sechd"><h2 class="bf-h2" id="bf-tl-h">'+esc(bfL('moreGuides'))+'</h2><span class="bf-cnt">'+esc(bfL('posts', {n:bfDig(list.length)}))+'</span></div>'+bfGrid(rest, ctx.key, ctx)+bfNoBnNote()+'</section>'+
    bfNews('topic-'+pid, true)+bfShopStrip([pil.shop[0]].concat(['polos','tshirts','shirts','panjabi','trousers','hoodies'].filter(function(x){ return x!==pil.shop[0]; })))+
  '</div>';
}
function bfTag(tag){
  var list = bfList().filter(function(p){ return (p.tags||[]).indexOf(tag) >= 0; }), ctx = {key:'tag-'+tag}, b = bfBase();
  return '<div class="container bf-page" data-bf="tag">'+
    bfHead([[bfL('home'), '#/'], [bfL('journalShort'), b], ['#'+bfTagName(tag), '']], bfL('taggedH', {t:bfTagName(tag)}), list.length===1 ? bfL('post1') : bfL('posts', {n:bfDig(list.length)}), {})+
    bfChips(null)+'<div class="bf-top">'+bfSlot('cat-top', ctx, 'wide')+'</div>'+
    '<section class="bf-sec" aria-label="'+esc(bfL('taggedH', {t:bfTagName(tag)}))+'">'+bfGrid(list, ctx.key, ctx)+'</section>'+bfBrowse()+'</div>';
}
function bfAuthorPage(id){
  var a = bfAuthor(id); if(!a) return bfNotFound();
  var b = bfBase(), list = bfList().filter(function(p){ return p.author===id; });
  return '<div class="container bf-page" data-bf="author">'+
    bfCrumbs([[bfL('home'), '#/'], [bfL('journalShort'), b], [bfAName(a), '']])+
    '<header class="bf-auth">'+bfAvatar(a, 88)+'<div class="bf-auth-t"><h1 class="bf-h1">'+esc(bfAName(a))+'</h1>'+
      '<p class="bf-auth-r">'+esc(bfL('aiAuthor', {p:bfPName(a.pillar)}))+(a.code ? ' · <span class="bf-code">'+esc(a.code)+'</span>' : '')+'</p>'+
      '<p class="bf-auth-bio"'+(BF.ul==='bn'?' lang="bn"':'')+'>'+esc(bfABio(a))+'</p>'+
      '<p class="bf-honest">'+ico('info',16)+'<span>'+esc(bfHonest())+(bfReviewer(a) ? ' '+esc(bfL('reviewedBy', {r:bfReviewer(a)}))+'.' : '')+'</span></p></div></header>'+
    '<section class="bf-std" aria-labelledby="bf-std-h"><h2 class="bf-h2" id="bf-std-h">'+esc(bfL('howWe'))+'</h2><ol class="bf-stdl">'+
      (BF.ul==='bn' ? ['প্রথমে সরাসরি উত্তর, তারপর বিস্তারিত।','প্রতিটা তথ্য আমাদের প্রোডাক্টের তথ্য, কেয়ার লেবেল আর সাইজ চার্টের সাথে মিলিয়ে দেখা হয়।','চালু হওয়ার আগে আরেকজন লেখক পড়ে দেখে — কেউ নিজের লেখা নিজে পাস করে না; শেষে Doot SEO দেখে।','কিছু বদলালে লেখা আপডেট হয়, তারিখও দেখানো থাকে।','ব্র্যান্ডের নাম তাদের মালিকের; টাকা নিয়ে কোনো প্রোডাক্ট বসানো হয় না।']
        : ['The answer comes first, the detail after.','Every fact is checked against our product data, care labels and size charts.','Another author proofreads before it goes live — nobody approves their own post — and Doot does the final SEO check.','Guides are updated when something changes, and the date shows it.','Brand names belong to their owners; no paid placements.']).map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ol></section>'+
    '<section class="bf-sec" aria-labelledby="bf-ap-h"><div class="bf-sechd"><h2 class="bf-h2" id="bf-ap-h">'+esc(bfL('guidesBy', {a:bfAName(a)}))+'</h2><span class="bf-cnt">'+esc(bfL('posts', {n:bfDig(list.length)}))+'</span></div>'+bfGrid(list, 'author-'+id, {key:'author-'+id})+'</section>'+
  '</div>';
}
function bfArchive(key){
  var b = bfBase(), list = bfList();
  if(key){
    var m = list.filter(function(p){ return new Date(p.date).toISOString().slice(0,7)===key; });
    return '<div class="container bf-page" data-bf="archive">'+bfHead([[bfL('home'), '#/'], [bfL('journalShort'), b], [bfL('archive'), b+'/archive'], [bfMonthName(key), '']], bfMonthName(key), bfL('posts', {n:bfDig(m.length)}), {})+
      bfChips(null)+'<section class="bf-sec" aria-label="'+esc(bfMonthName(key))+'">'+bfGrid(m, 'arch-'+key, {key:'arch-'+key})+'</section></div>';
  }
  return '<div class="container bf-page" data-bf="archive">'+bfHead([[bfL('home'), '#/'], [bfL('journalShort'), b], [bfL('archive'), '']], bfL('archiveH'), bfL('archiveP'), {})+bfChips(null)+bfBrowse()+'</div>';
}
function bfSearchPage(q){
  q = String(q||'').trim(); var b = bfBase(), words = q.toLowerCase().split(/\s+/).filter(Boolean);
  var scored = !words.length ? [] : bfList().map(function(p){
    var v = bfV(p), s = 0, T = v.title.toLowerCase(), D = (v.dek||'').toLowerCase(), B = (v.body||'').toLowerCase(), G = (p.tags||[]).join(' ').toLowerCase()+' '+bfPName(p.pillar, 'en').toLowerCase()+' '+bfPName(p.pillar, 'bn');
    words.forEach(function(w){ if(T.indexOf(w)>=0) s += 5; if(G.indexOf(w)>=0) s += 3; if(D.indexOf(w)>=0) s += 2; if(B.indexOf(w)>=0) s += 1; });
    return {p:p, s:s};
  }).filter(function(x){ return x.s > 0; }).sort(function(a, b2){ return b2.s - a.s || b2.p.date - a.p.date; }).map(function(x){ return x.p; });
  var head = !q ? '' : (scored.length ? esc(scored.length===1 ? bfL('result1', {q:q}) : bfL('results', {n:bfDig(scored.length), q:q})) : esc(bfL('noResults', {q:q})));
  var tags = ['polo','washing','denim','winter','eid','gsm','fit'];
  var empty = (q && !scored.length) || !q ? '<div class="bf-noresult"><p>'+esc(bfL('tryTags'))+'</p><div class="bf-tagrow wrap">'+tags.map(function(tg){ return '<a class="bf-tag" href="'+b+'/tag/'+tg+'">#'+esc(tg)+'</a>'; }).join('')+'</div></div>' : '';
  return '<div class="container bf-page" data-bf="search">'+bfHead([[bfL('home'), '#/'], [bfL('journalShort'), b], [bfL('crumbSearch'), '']], bfL('searchH'), '', {q:q})+
    '<p class="bf-resc" role="status">'+head+'</p>'+(scored.length ? '<section class="bf-sec" aria-label="'+esc(bfL('crumbSearch'))+'">'+bfGrid(scored, 'search-'+q, {key:'search'})+'</section>' : '')+empty+'</div>';
}
function bfRss(){
  var b = bfBase(), list = bfList().slice(0, 3), live = 'https://extas.com.bd'+(BF.route==='bn' ? '/bn' : '')+'/journal';
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>'+bfL('journal')+'</title>\n  <link>'+live+'</link>\n'+list.map(function(p){ var v = bfV(p); return '  <item>\n    <title>'+v.title+'</title>\n    <link>'+live+'/'+p.slug+'</link>\n    <pubDate>'+new Date(p.date).toUTCString()+'</pubDate>\n  </item>\n'; }).join('')+'</channel>\n</rss>';
  return '<div class="container bf-page" data-bf="rss">'+bfHead([[bfL('home'), '#/'], [bfL('journalShort'), b], [bfL('rssH'), '']], bfL('rssH'), BF.ul==='bn' ? 'লাইভ দোকানে ফিডের ঠিকানা: '+live+'/rss.xml — Feedly-র মতো রিডার নতুন গাইড নিজে থেকেই দেখাবে। নিচে ডেমো:' : 'In the live shop the feed lives at '+live+'/rss.xml — readers like Feedly pick up new guides from it by themselves. Demo preview:', {search:false})+
    '<pre class="bf-pre" tabindex="0">'+esc(xml)+'</pre></div>';
}
function bfNotFound(){
  return '<div class="container bf-page empty" data-bf="nf"><h1 class="bf-h1">'+esc(bfL('notFound'))+'</h1><a class="btn btn-primary mt16" href="'+bfBase()+'">'+esc(bfL('allGuides'))+'</a></div>';
}

/* ---------- product block ("Products in this guide") ---------- */
function bfProdCard(p){
  return '<article class="bf-pc"><a class="bf-pc-img" href="#/p/'+p.id+'" tabindex="-1" aria-hidden="true">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</a>'+
    '<div class="bf-pc-b"><a class="bf-pc-n bf-stretch" href="#/p/'+p.id+'">'+esc(p.name)+'</a><div class="bf-pc-p">'+bfMoney(p.price)+(p.compareAt ? ' <span class="strike small">'+bfMoney(p.compareAt)+'</span>' : '')+'<span class="bf-pc-c">'+esc(bfL('colours', {n:bfDig(p.colors.length)}))+'</span></div>'+
    '<div class="bf-pc-act"><button type="button" class="btn btn-primary" data-act="bf-add" data-id="'+p.id+'" data-color="'+esc(p.colors[0])+'"><span class="bf-full">'+esc(bfL('add'))+'</span><span class="bf-short">'+esc(bfL('addShort'))+'</span></button>'+
    '<a class="btn btn-ghost bf-pc-v" href="#/p/'+p.id+'">'+esc(bfL('view'))+'</a></div></div></article>';
}
function bfComboCard(c){
  var single = (c.items||[]).reduce(function(s, id){ var q = P(id); return s + (q ? q.price : 0); }, 0);
  return '<article class="bf-pc combo"><a class="bf-pc-img" href="#/combo/'+c.id+'" tabindex="-1" aria-hidden="true">'+bfComboImg(c, 'ratio-11')+'</a>'+
    '<div class="bf-pc-b"><a class="bf-pc-n bf-stretch" href="#/combo/'+c.id+'">'+esc(c.name)+'</a><div class="bf-pc-p">'+bfMoney(c.price)+(single > c.price ? ' <span class="bf-save">'+esc(bfL('save', {x:bfMoney(single - c.price)}))+'</span>' : '')+'</div>'+
    '<div class="bf-pc-act"><a class="btn btn-secondary" href="#/combo/'+c.id+'">'+esc(bfL('chooseCol'))+'</a></div></div></article>';
}
function bfProducts(post){
  var ps = (post.products||[]).map(P).filter(Boolean).slice(0, 4), cs = (post.combos||[]).map(function(id){ return typeof COMBO==='function' ? COMBO(id) : null; }).filter(function(c){ return c && c.active!==false; });
  var cards = ps.map(bfProdCard).concat(cs.map(bfComboCard)).slice(0, 4);
  if(!cards.length) return '';
  return '<section class="bf-prods" aria-labelledby="bf-prods-h"><h2 class="bf-prods-h" id="bf-prods-h">'+esc(bfL('prodsIn'))+'</h2><div class="bf-prods-g">'+cards.join('')+'</div></section>';
}

/* ---------- the post page ---------- */
function bfPost(slug){
  var post = bfFind(slug); if(!post) return bfNotFound();
  var v = bfV(post), b = bfBase(), bnRoute = BF.route==='bn', noBn = bnRoute && v.lang!=='bn';
  var ctx = {key:'post-'+post.slug, slug:post.slug, pillar:post.pillar};
  BF.ctx = {kind:'post', slug:post.slug, pillar:post.pillar, shop:post.shop};
  var lang = v.lang==='bn' ? ' lang="bn"' : ' lang="en"', a = post.authorObj || BF_TEAM;
  var pname = bfPName(post.pillar), set = bfAdSet();
  /* body */
  var blocks = bfBlocks(v.body), toc = [], html = '', pcount = 0, inl = 0, every = Math.max(2, Number(set.inlineAfter)||3), maxI = Math.max(0, Number(set.maxInline)||0);
  var totalP = blocks.filter(function(x){ return x.t==='p'; }).length, nextAt = every, hadProducts = false;
  blocks.forEach(function(bl, i){
    if(bl.t==='h2'){ var id = 'bf-s'+(toc.length+1); toc.push({id:id, s:bl.s}); html += '<h2 id="'+id+'" class="bf-ph2">'+bfInline(bl.s)+'</h2>'; }
    else if(bl.t==='h3') html += '<h3 class="bf-ph3">'+bfInline(bl.s)+'</h3>';
    else if(bl.t==='p'){
      html += '<p>'+bfInline(bl.s)+'</p>'; pcount++;
      var nx = blocks[i+1];
      if(inl < maxI && pcount >= nextAt && totalP - pcount >= 2 && !(nx && nx.t==='products')){
        var ad = bfPick('post-inline', ctx, inl);
        if(ad){ html += bfAdHTML(ad, 'post-inline', 'wide'); inl++; nextAt = pcount + every + 3; }
      }
    }
    else if(bl.t==='box') html += '<div class="bf-box '+bl.k+'"><div class="bf-box-l">'+ico(bl.k==='tip'?'spark':'info',16)+esc(bfL(bl.k))+'</div><p>'+bfInline(bl.s)+'</p></div>';
    else if(bl.t==='ol') html += '<ol class="bf-steps">'+bl.items.map(function(it){ return '<li>'+bfInline(it)+'</li>'; }).join('')+'</ol>';
    else if(bl.t==='ul') html += '<ul class="bf-ul">'+bl.items.map(function(it){ return '<li>'+bfInline(it)+'</li>'; }).join('')+'</ul>';
    else if(bl.t==='fig'){ var fp = P(bl.p); if(fp) html += '<figure class="bf-fig">'+productImg(fp, fp.colors.indexOf(bl.c)>=0 ? bl.c : fp.colors[0], {ratio:'bf-r32', label:false})+'<figcaption>'+bfInline(bl.s)+'</figcaption></figure>'; }
    else if(bl.t==='products'){ html += bfProducts(post); hadProducts = true; }
  });
  if(!hadProducts) html += bfProducts(post);
  if(post.thin) html += '<p class="bf-thin">'+esc(bfL('shortNote'))+'</p>';
  /* pieces */
  var crumbs = bfCrumbs([[bfL('home'), '#/'], [bfL('journalShort'), b], [pname, b+'/topic/'+post.pillar]]);
  var twin = '';
  if(post.lang==='en' && post.bn) twin = bnRoute ? bfLangLink(false, '#/journal/'+post.slug).replace('>English<', '>'+esc(bfL('readEn'))+'<') : bfLangLink(true, '#/bn/journal/'+post.slug).replace('>বাংলা<', '>বাংলায় পড়ুন<');
  var eyebrow = '<div class="bf-eyebrow"><a class="bf-pl bf-pl-a" href="'+b+'/topic/'+post.pillar+'">'+esc(pname)+'</a>'+
    (post.demo ? '<span class="bf-flag">'+esc(bfL('demo'))+'</span>' : '')+(post.brand3p ? '<span class="bf-flag">'+esc(bfL('brandGuide'))+'</span>' : '')+'<span class="grow"></span>'+twin+'</div>';
  var by = '<div class="bf-by">'+bfAvatar(a, 44)+'<div class="bf-by-t"><div class="bf-by-l1">'+esc(bfL('by', {a:bfAName(a)}))+(a.team ? '' : '<span class="bf-by-ai"> · '+esc(BF.ul==='bn' ? 'AI লেখক' : 'AI author')+'</span>')+'</div>'+
    (post.reviewer ? '<div class="bf-by-l2">'+esc(bfL('reviewedBy', {r:post.reviewer}))+'</div>' : '')+
    '<div class="bf-by-l3"><span>'+esc(bfL('updated', {d:bfDate(post.updated)}))+'</span><span class="bf-by-pub"><span aria-hidden="true"> · </span>'+esc(bfL('published', {d:bfDate(post.date)}))+'</span><span aria-hidden="true"> · </span><span>'+esc(bfL('minRead', {n:bfDig(v.mins)}))+'</span></div></div></div>';
  var hero = '<figure class="bf-hero">'+bfHeroImg(post, 'ratio-wide')+'<figcaption>'+esc(BF.ul==='bn' ? 'ডেমো ছবি: পোশাকের ড্রয়িং — আসল ছবি আসবে নিজেদের শুট থেকে (PR 547)।' : 'Demo picture: garment drawing — real photos come from our own shoot (PR 547).')+'</figcaption></figure>';
  var quick = v.quick ? '<section class="bf-quick" aria-labelledby="bf-quick-h"><h2 class="bf-quick-l" id="bf-quick-h">'+ico('check',16)+esc(bfL('quick'))+'</h2><p'+lang+'>'+bfInline(v.quick)+'</p></section>' : '';
  var tocList = toc.map(function(x, i){ return '<li><a href="#'+x.id+'" data-act="bf-toc" data-id="'+x.id+'"><span class="bf-tocn">'+bfDig(i+1)+'</span><span'+lang+'>'+bfInline(x.s).replace(/<[^>]+>/g,'')+'</span></a></li>'; }).join('');
  var tocM = toc.length > 2 ? '<details class="bf-tocm"><summary><span>'+esc(bfL('inGuide'))+'</span><span class="bf-cnt">'+esc(bfL('sections', {n:bfDig(toc.length)}))+'</span>'+ico('down',18)+'</summary><ol>'+tocList+'</ol></details>' : '';
  var tocD = toc.length > 2 ? '<nav class="bf-tocd" aria-label="'+esc(bfL('contents'))+'"><div class="bf-tocd-h">'+esc(bfL('contents'))+'</div><ol>'+tocList+'</ol></nav>' : '';
  var url = location.href.split('#')[0] + bfHref(post);
  var share = '<section class="bf-share" aria-labelledby="bf-share-h"><h2 class="bf-share-h" id="bf-share-h">'+esc(bfL('share'))+'</h2><div class="bf-share-r">'+
    '<a class="bf-sh wa" href="https://wa.me/?text='+encodeURIComponent(v.title+' '+url)+'" target="_blank" rel="noopener" aria-label="'+esc(bfL('share_wa'))+'">'+waGlyph(18)+'<span>'+esc(bfL('share_wa'))+'</span></a>'+
    '<a class="bf-sh fb" href="https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url)+'" target="_blank" rel="noopener" aria-label="'+esc(bfL('share_fb'))+'">'+ico('facebook',18)+'<span>'+esc(bfL('share_fb'))+'</span></a>'+
    '<button type="button" class="bf-sh cp" data-act="bf-copy" data-url="'+esc(url)+'" aria-label="'+esc(bfL('copy'))+'">'+ico('link',18)+'<span>'+esc(bfL('copy'))+'</span></button></div></section>';
  var tags = (post.tags||[]).length ? '<nav class="bf-ptags" aria-label="'+esc(bfL('tags'))+'"><div class="bf-tagrow">'+post.tags.map(function(tg){ return '<a class="bf-tag" href="'+b+'/tag/'+tg+'">#'+esc(bfTagName(tg))+'</a>'; }).join('')+'</div></nav>' : '';
  var about = '<section class="bf-about" aria-labelledby="bf-about-h">'+bfAvatar(a, 48)+'<div><h2 class="bf-about-h" id="bf-about-h">'+esc(bfL('aboutH'))+'</h2><p>'+esc(a.team ? bfHonest()+'.' : bfL('aboutP', {a:bfAName(a)}))+(post.reviewer ? ' '+esc(bfL('reviewedBy', {r:post.reviewer}))+'.' : '')+'</p>'+
    '<a class="bf-about-l" href="'+(a && !a.team ? b+'/author/'+a.id : b)+'">'+esc(bfL('howWe'))+ico('right',14)+'</a></div></section>';
  var rel = bfList().filter(function(p){ return p !== post && p.pillar===post.pillar; });
  if(rel.length < 3) rel = rel.concat(bfList().filter(function(p){ return p !== post && rel.indexOf(p) < 0; })).slice(0, 3); else rel = rel.slice(0, 3);
  var related = rel.length ? '<section class="bf-related" aria-labelledby="bf-rel-h"><div class="bf-sechd"><h2 class="bf-h2" id="bf-rel-h">'+esc(bfL('related', {p:pname}))+'</h2><a class="bf-more-l" href="'+b+'/topic/'+post.pillar+'">'+esc(bfL('viewAll'))+ico('right',14)+'</a></div><div class="bf-relrow">'+rel.map(bfCard).join('')+'</div></section>' : '';
  /* the slim bar (slot post-bar) and its data */
  var barAd = bfPick('post-bar', ctx, 0), bar = '';
  if(barAd){ var bv = bfAdView(barAd);
    bar = '<div class="bf-bar" id="bf-bar" data-bf-ad="'+esc(barAd.id)+'" data-bf-slot="post-bar" aria-label="'+esc(bfL('adLabel'))+'" role="complementary"><div class="bf-bar-in"><span class="bf-bar-l">'+esc(bfL('adLabel'))+'</span><span class="bf-bar-t">'+esc(bv.title)+'</span>'+
      '<a class="btn btn-primary bf-bar-b" href="'+esc(bv.href)+'">'+esc(barAd.cta || (post.shop ? (BF.ul==='bn' ? post.shop[2] : post.shop[1]) : bv.cta))+'</a>'+
      '<button type="button" class="iconbtn bf-bar-x" data-act="bf-bar-x" aria-label="'+esc(bfL('dismiss'))+'">'+ico('close',18)+'</button></div></div>'; }
  var ld = {'@context':'https://schema.org', '@type':'BlogPosting', headline:v.title, inLanguage:v.lang, datePublished:new Date(post.date).toISOString(), dateModified:new Date(post.updated).toISOString(),
    author:{'@type':'Organization', name:'EXTAS'}, publisher:{'@type':'Organization', name:'EXTAS'}, mainEntityOfPage:'https://extas.com.bd'+(v.lang==='bn' ? '/bn' : '')+'/journal/'+post.slug};
  return '<div class="container bf-page bf-postpage" data-bf="post">'+
    '<div class="bf-pgrid"><article class="bf-art" id="bf-article">'+
      '<header class="bf-phd">'+crumbs+eyebrow+'<h1 class="bf-ptitle"'+lang+'>'+esc(v.title)+'</h1><p class="bf-pdek"'+lang+'>'+esc(v.dek)+'</p>'+by+
        (noBn ? '<p class="bf-bnnote" lang="bn">'+esc(bfL('noBn'))+'</p>' : '')+'</header>'+
      hero+quick+'<div class="bf-ptop">'+bfSlot('post-top', ctx, 'slim')+'</div>'+tocM+
      '<div class="bf-prose"'+lang+'>'+html+'</div>'+tags+share+about+'</article>'+
      '<aside class="bf-side"><div class="bf-side-in">'+tocD+bfSlot('post-sidebar', ctx, 'side')+'</div></aside></div>'+
    '<div class="bf-pend">'+bfSlot('post-end', ctx, 'wide')+'</div>'+related+bfNews('post', true)+
    bar+'<script type="application/ld+json">'+JSON.stringify(ld).replace(/</g,'\\u003c')+'<\/script>'+
  '</div>';
}

/* =====================================================================
   ROUTER HOOK — one route at the front of ROUTES; PAGES.journal redefined
   ===================================================================== */
function bfParse(params){
  var bn = !!params[0], rest = String(params[1]||'').replace(/\/+$/,''), parts = rest ? rest.split('/') : [];
  return {lang:bn ? 'bn' : 'en', parts:parts};
}
function bfSetLang(r){
  BF.route = r.lang;
  BF.ul = (r.lang==='bn' || (typeof ST!=='undefined' && ST && ST.lang==='bn')) ? 'bn' : 'en';
}
if(typeof ROUTES !== 'undefined') ROUTES.unshift([/^\/(bn\/)?journal(?:\/([\w\/.-]*))?$/, 'journal']);
if(typeof FAB_PAGES !== 'undefined') FAB_PAGES.journal = false;   /* reading pages: the header WhatsApp is enough, no floating disc over the text */
PAGES.journal = {
  layout:'store',
  title:function(params){
    var r = bfParse(params); bfSetLang(r); BF.cache = null; var p = r.parts;
    if(!p.length) return bfL('journal');
    if(p[0]==='topic'){ return p[2] ? bfSubName(p[1], p[2]) : bfPName(p[1]) || bfL('journal'); }
    if(p[0]==='tag') return bfL('taggedH', {t:bfTagName(p[1]||'')});
    if(p[0]==='author'){ var a = bfAuthor(p[1]); return a ? bfAName(a) : bfL('journal'); }
    if(p[0]==='archive') return p[1] ? bfMonthName(p[1]) : bfL('archiveH');
    if(p[0]==='search') return bfL('searchH');
    if(p[0]==='rss') return bfL('rssH');
    var post = bfFind(p[0]); return post ? bfV(post).title : bfL('notFound');
  },
  render:function(params, q){
    var r = bfParse(params); bfSetLang(r); BF.cache = null; BF.used = {}; BF.ctx = {kind:'list'}; var p = r.parts;
    if(!p.length) return bfHome();
    if(p[0]==='topic' && p[1] && p.length <= 3) return bfTopic(p[1], p[2]);
    if(p[0]==='tag' && p[1] && p.length===2) return bfTag(p[1]);
    if(p[0]==='author' && p[1] && p.length===2) return bfAuthorPage(p[1]);
    if(p[0]==='archive' && p.length <= 2) return bfArchive(p[1]);
    if(p[0]==='search' && p.length===1) return bfSearchPage(q && q.q);
    if(p[0]==='rss' && p.length===1) return bfRss();
    if(p.length===1) return bfPost(p[0]);
    return bfNotFound();
  },
  after:function(params, q){ bfAfter(q || {}); }
};

/* =====================================================================
   AFTER RENDER — ad views, contents highlight, slim bar, popup, focus
   ===================================================================== */
function bfStore(kind){ try{ return kind==='s' ? window.sessionStorage : window.localStorage; }catch(e){ return null; } }
function bfAfter(q){
  var my = ++BF.tok;
  /* ad views (for the per-ad, per-slot report, PR 592) */
  [].forEach.call(document.querySelectorAll('[data-bf-ad]'), function(el){ if(el.id!=='bf-bar') bfAdStat(el.getAttribute('data-bf-ad'), el.getAttribute('data-bf-slot'), 'v'); });
  try{ saveState(); }catch(e){}
  /* keyboard: after "Load more", focus goes to the first new card */
  if(BF.focusFrom >= 0){ var c = document.querySelector('.bf-card[data-i="'+BF.focusFrom+'"] a'); BF.focusFrom = -1; if(c) try{ c.focus({preventScroll:true}); }catch(e){} }
  if(BF.io){ try{ BF.io.disconnect(); }catch(e){} BF.io = null; }
  var ctx = BF.ctx || {};
  BF.pop = null; BF.barShown = false;
  try{ var ss = bfStore('s'); BF.barOff = !!(ss && ss.getItem('bf-bar-off')); }catch(e){}
  if(ctx.kind!=='post') return;
  /* contents: highlight the section being read (desktop side list) */
  if('IntersectionObserver' in window){
    var links = [].slice.call(document.querySelectorAll('.bf-tocd a'));
    if(links.length){
      BF.io = new IntersectionObserver(function(ents){
        ents.forEach(function(en){ if(en.isIntersecting){ links.forEach(function(l){ var on = l.getAttribute('data-id')===en.target.id; l.classList.toggle('on', on); if(on) l.setAttribute('aria-current','location'); else l.removeAttribute('aria-current'); }); } });
      }, {rootMargin:'-90px 0px -65% 0px'});
      [].forEach.call(document.querySelectorAll('.bf-prose h2[id]'), function(h){ BF.io.observe(h); });
    }
  }
  /* popup: one per page, only when the owner set one for this post or category */
  var ad = bfPick('post-popup', {key:'pop-'+ctx.slug, slug:ctx.slug, pillar:ctx.pillar}, 0);
  if(ad && bfPopCapOk(ad)){
    var pp = ad.popup || {}, set = bfAdSet();
    var fromSearch = (q.from==='google' || q.from==='search') || /(^|\.)(google|bing|duckduckgo|yahoo|yandex)\./i.test(document.referrer || '');
    var phone = window.innerWidth < 768;
    BF.pop = {ad:ad, trig:pp.trigger || 'scroll', val:Number(pp.value) || (pp.trigger==='time' ? 20 : 50), delay:Math.max(0, Number(pp.delay)||0),
      beyondFirst:phone && fromSearch && !set.popupOnMobileFromSearch, armed:true, tok:my};
    if(BF.pop.trig==='time') setTimeout(function(){ if(BF.tok===my && BF.pop) { BF.pop.timeUp = true; bfTryPop(); } }, BF.pop.val * 1000);
  }
  bfScroll();
}
function bfPopCapOk(ad){
  if(BF.popShown[ad.id]) return false;
  var f = (ad.popup && ad.popup.freq) || 'session';
  if(f==='session'){ var s = bfStore('s'); try{ return !(s && s.getItem('bf-pop-'+ad.id)); }catch(e){ return true; } }
  var l = bfStore('l'), ms = f==='week' ? 7*86400000 : 86400000;
  try{ var at = Number(l && l.getItem('bf-pop-'+ad.id)) || 0; return Date.now() - at > ms; }catch(e){ return true; }
}
function bfPopMark(ad){
  BF.popShown[ad.id] = 1; var f = (ad.popup && ad.popup.freq) || 'session';
  try{ if(f==='session'){ var s = bfStore('s'); if(s) s.setItem('bf-pop-'+ad.id, '1'); } else { var l = bfStore('l'); if(l) l.setItem('bf-pop-'+ad.id, String(Date.now())); } }catch(e){}
}
function bfArtProgress(){
  var a = document.getElementById('bf-article'); if(!a) return 0;
  var r = a.getBoundingClientRect(); var h = Math.max(1, r.height);
  return Math.max(0, Math.min(1, (window.innerHeight - r.top) / h));
}
function bfTryPop(exit){
  var P0 = BF.pop; if(!P0 || !P0.armed || CUR.page!=='journal') return;
  if(document.querySelector('.modal-back, .zm')) return;
  var ok = P0.trig==='scroll' ? bfArtProgress()*100 >= P0.val : P0.trig==='time' ? !!P0.timeUp : !!exit;
  if(!ok) return;
  /* Google's intrusive-interstitial guidance: a phone visitor from search never gets it on the first screen */
  if(P0.beyondFirst && (window.pageYOffset||0) < window.innerHeight) return;
  P0.armed = false;
  setTimeout(function(){ if(BF.pop!==P0 || BF.tok!==P0.tok || document.querySelector('.modal-back')) return; bfShowPop(P0.ad); }, P0.delay * 1000);
}
function bfShowPop(ad){
  bfPopMark(ad); bfAdStat(ad.id, 'post-popup', 'v');
  var v = bfAdView(ad, 'ratio-wide');
  var cta = v.add ? '<button type="button" class="btn btn-primary btn-block" data-act="bf-add" data-id="'+esc(v.add.pid)+'" data-color="'+esc(v.add.color)+'">'+esc(bfL('add'))+'</button>'
    : '<a class="btn btn-primary btn-block" href="'+esc(v.href)+'">'+esc(v.cta)+'</a>';
  var html = '<div class="bf-popc" data-bf-ad="'+esc(ad.id)+'" data-bf-slot="post-popup"><a class="bf-pop-img" href="'+esc(v.href)+'" tabindex="-1" aria-hidden="true">'+v.img+'</a>'+
    '<div class="bf-pop-t">'+esc(v.title)+'</div>'+(v.sub ? '<p class="bf-pop-s">'+esc(v.sub)+'</p>' : '')+(v.price ? '<div class="bf-adprice">'+v.price+'</div>' : '')+cta+
    '<button type="button" class="btn btn-ghost btn-block bf-pop-no" data-act="close-modal">'+esc(bfL('noThanks'))+'</button></div>';
  openModal(html, {title:bfL('adLabel'), cls:'bf-pop'});
  bfBar(false);
}
function bfBar(on){
  var bar = document.getElementById('bf-bar'), pg = document.querySelector('.bf-postpage'); if(!bar) return;
  on = on && !BF.barOff && !document.querySelector('.modal-back');
  bar.classList.toggle('on', on); if(pg) pg.classList.toggle('bar-on', on);
  if(on && !BF.barShown){ BF.barShown = true; bfAdStat(bar.getAttribute('data-bf-ad'), 'post-bar', 'v'); }
}
function bfScroll(){
  if(CUR.page!=='journal' || !BF.ctx || BF.ctx.kind!=='post') return;
  var p = bfArtProgress();
  if(document.getElementById('bf-bar')){ if(p >= 0.6) bfBar(true); else if(p < 0.45) bfBar(false); }
  bfTryPop();
}
if(!BF.scrollBound){
  BF.scrollBound = true;
  var bfRaf = 0;
  window.addEventListener('scroll', function(){ if(bfRaf) return; bfRaf = requestAnimationFrame(function(){ bfRaf = 0; bfScroll(); }); }, {passive:true});
  document.addEventListener('mouseout', function(e){ if(!e.relatedTarget && e.clientY <= 0 && BF.pop && BF.pop.trig==='exit') bfTryPop(true); });
}

/* =====================================================================
   ACTIONS
   ===================================================================== */
ACT['bf-more'] = function(el){ var k = el.getAttribute('data-k'), n = Number(el.getAttribute('data-n')) || BF_PAGE; BF.more[k] = n + BF_PAGE; BF.focusFrom = n; rerender(); };
ACT['bf-toc'] = function(el){
  var h = document.getElementById(el.getAttribute('data-id')); if(!h) return;
  var d0 = el.closest('details'); if(d0) d0.open = false;          /* close the phone list first, so the jump lands right */
  var hdr = document.querySelector('.hdr'), off = (hdr ? hdr.getBoundingClientRect().height : 60) + 16;
  var y = h.getBoundingClientRect().top + window.pageYOffset - off;
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({top:y, behavior:rm ? 'auto' : 'smooth'});
  h.setAttribute('tabindex', '-1'); try{ h.focus({preventScroll:true}); }catch(e){}
};
ACT['bf-copy'] = function(el){
  var u = el.getAttribute('data-url'), done = function(){ toast(bfL('copied')); };
  try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(u).then(done, function(){ bfCopyOld(u); done(); }); return; } }catch(e){}
  bfCopyOld(u); done();
};
function bfCopyOld(u){ try{ var t0 = document.createElement('textarea'); t0.value = u; t0.setAttribute('readonly',''); t0.style.position = 'fixed'; t0.style.opacity = '0'; document.body.appendChild(t0); t0.select(); document.execCommand('copy'); t0.remove(); }catch(e){} }
ACT['bf-bar-x'] = function(){ BF.barOff = true; try{ var s = bfStore('s'); if(s) s.setItem('bf-bar-off', '1'); }catch(e){} bfBar(false); };
SUBMIT['bf-search'] = function(f){ var q = (f.querySelector('[name=q]').value || '').trim(); go(bfBase()+'/search'+(q ? '?q='+encodeURIComponent(q) : '')); };
SUBMIT['bf-news'] = function(f){
  var src = f.getAttribute('data-src'), v = (f.querySelector('[name=v]').value || '').trim().replace(/[০-৯]/g, function(c){ return String(c.charCodeAt(0) - 0x09E6); });
  var phone = v.replace(/[\s-]/g, '').replace(/^\+?88/, ''), ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || /^01[3-9]\d{8}$/.test(phone);
  if(!ok){ UI['bf-news-err:'+src] = true; rerender(); var i = document.getElementById('bf-news-i-'+src); if(i){ i.value = v; i.focus(); } return; }
  UI['bf-news-err:'+src] = false; UI['bf-news:'+src] = true;
  try{ if(!ST.blogSubs) ST.blogSubs = []; ST.blogSubs.push({v:v, at:Date.now(), lang:BF.route, src:src}); saveState(); }catch(e){}
  rerender();
};
/* "Add to bag" from a guide or an ad: a small size sheet (opened by the shopper, never by itself) */
function bfAddHTML(){
  var u = UI.bfAdd || {}, p = P(u.pid); if(!p) return '';
  var cols = p.colors.map(function(c){ var C = COL(c), on = c===u.color; return '<button type="button" class="bf-sw'+(on?' on':'')+'" data-act="bf-add-col" data-v="'+c+'" aria-pressed="'+on+'" aria-label="'+esc(C.name)+'"><span style="background:'+C.hex+'"></span></button>'; }).join('');
  var sizes = p.sizes.map(function(s){ var st = stockOf(p.id, u.color, s), on = s===u.size; return '<button type="button" class="bf-sz'+(on?' on':'')+(st<=0?' oos':'')+'" data-act="bf-add-size" data-v="'+s+'" aria-pressed="'+on+'"'+(st<=0?' disabled aria-label="'+esc(s+' '+bfL('soldOut'))+'"':'')+'>'+esc(s)+'</button>'; }).join('');
  return '<div class="bf-addm"><div class="bf-addm-top">'+productImg(p, u.color, {ratio:'ratio-11', label:false})+'<div><div class="bf-addm-n">'+esc(p.name)+'</div><div class="bf-addm-p">'+bfMoney(p.price)+'</div></div></div>'+
    '<div class="bf-addm-l">'+esc(bfL('colour'))+' — <b>'+esc(COL(u.color).name)+'</b></div><div class="bf-addm-row">'+cols+'</div>'+
    '<div class="bf-addm-l">'+esc(bfL('chooseSize'))+(u.size ? ' — <b>'+esc(u.size)+'</b>' : '')+'</div><div class="bf-addm-row">'+sizes+'</div>'+
    (u.err ? '<p class="bf-news-e" role="alert">'+esc(bfL('pickSize'))+'</p>' : '')+
    '<button type="button" class="btn btn-primary btn-block mt12" data-act="bf-add-go">'+esc(bfL('add'))+'</button>'+
    '<a class="btn btn-ghost btn-block mt8" href="#/p/'+p.id+'">'+esc(bfL('fullDetails'))+'</a></div>';
}
ACT['bf-add'] = function(el){
  var pid = el.getAttribute('data-id'), p = P(pid); if(!p) return;
  if(document.querySelector('.modal-back')) closeModal();
  UI.bfAdd = {pid:pid, color:el.getAttribute('data-color') || p.colors[0], size:null, err:false};
  openModal(bfAddHTML(), {title:bfL('chooseSize'), rebuild:bfAddHTML, cls:'bf-addsheet'});
};
ACT['bf-add-col'] = function(el){ var u = UI.bfAdd; if(!u) return; u.color = el.getAttribute('data-v'); if(u.size && stockOf(u.pid, u.color, u.size) <= 0) u.size = null; refreshModal(); };
ACT['bf-add-size'] = function(el){ var u = UI.bfAdd; if(!u) return; u.size = el.getAttribute('data-v'); u.err = false; refreshModal(); };
ACT['bf-add-go'] = function(){
  var u = UI.bfAdd; if(!u) return;
  if(!u.size){ u.err = true; refreshModal(); return; }
  var res = bagAdd({kind:'item', product:u.pid, color:u.color, size:u.size, qty:1});
  closeModal();
  if(res && res.added){ rerender(); toast(bfL('added')); }
  else if(res && res.reason==='already') toast(BF.ul==='bn' ? 'এটা আগেই ব্যাগে আছে' : 'Already in your bag');
  else if(res && res.msg) toast(res.msg);
};
