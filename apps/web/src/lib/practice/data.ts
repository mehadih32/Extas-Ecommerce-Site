// S28 · PR 706 (CN-049) — the practice (sample) data: the admin prototype v5's own names, areas, products, prices, couriers
// and rules (docs/demo/admin-proto-v5/js/core.js), in one place. Nothing here is a real person: names are the
// prototype's made-up ones and every phone number sits in a reserved range no operator uses (PRACTICE_PHONE_PREFIX).
// The amounts are the prototype's sample figures in whole taka (the seeder converts them to the store's minor units).
import catalogueJson from './demo-catalogue.json';
import extrasJson from './demo-extras.json';


export const FIRST_NAMES = [
  'Rahim',
  'Karim',
  'Sakib',
  'Tanvir',
  'Rafiq',
  'Imran',
  'Nayeem',
  'Shuvo',
  'Arif',
  'Hasan',
  'Mahmud',
  'Fahim',
  'Rakib',
  'Sajid',
  'Tamim',
  'Rasel',
  'Jubayer',
  'Mehedi',
  'Asif',
  'Sabbir',
  'Nafis',
  'Ridwan',
  'Shakil',
  'Rony',
  'Zahid',
  'Ashik',
] as const;
export const LAST_NAMES = [
  'Ahmed',
  'Hossain',
  'Islam',
  'Rahman',
  'Chowdhury',
  'Uddin',
  'Khan',
  'Mia',
  'Sarkar',
  'Talukder',
  'Sheikh',
  'Biswas',
  'Das',
  'Akter',
  'Kabir',
  'Haque',
] as const;

export type Zone = 'inside' | 'sub' | 'outside';
export const DHAKA_AREAS = [
  'Mirpur',
  'Uttara',
  'Dhanmondi',
  'Mohammadpur',
  'Gulshan',
  'Banani',
  'Badda',
  'Bashundhara',
  'Motijheel',
  'Old Dhaka',
  'Jatrabari',
  'Khilgaon',
  'Rampura',
  'Tejgaon',
  'Farmgate',
  'Malibagh',
] as const;
export const SUB_AREAS: readonly (readonly [string, string])[] = [
  ['Gazipur', 'Tongi'],
  ['Gazipur', 'Board Bazar'],
  ['Narayanganj', 'Fatullah'],
  ['Dhaka', 'Savar'],
  ['Dhaka', 'Keraniganj'],
  ['Narayanganj', 'Siddhirganj'],
];
export const OUTSIDE_AREAS: readonly (readonly [string, string])[] = [
  ['Chattogram', 'Agrabad'],
  ['Chattogram', 'Halishahar'],
  ['Sylhet', 'Zindabazar'],
  ['Rajshahi', 'Shaheb Bazar'],
  ['Khulna', 'Sonadanga'],
  ['Cumilla', 'Kandirpar'],
  ['Mymensingh', 'Ganginarpar'],
  ['Bogura', 'Satmatha'],
  ['Rangpur', 'Jahaj Company'],
  ['Barishal', 'Nathullabad'],
  ["Cox's Bazar", 'Kolatoli'],
  ['Jessore', 'Doratana'],
  ['Feni', 'Trunk Road'],
  ['Noakhali', 'Maijdee'],
];

/** The prototype's delivery fees by zone (whole taka) and its free-delivery line. */
export const DELIVERY_FEE: Record<Zone, number> = {
  inside: 80,
  sub: 100,
  outside: 130,
};
export const FREE_DELIVERY_OVER = 3000; // hardcode-ok: a sample-data figure for the practice shop, never a rule of the real shop

/** The prototype's categories: code, name, price range (whole taka), garment kind, sample names (two of each are made). */
export const CATEGORIES = [
  {
    code: 'PL',
    name: 'Polo shirts',
    price: [850, 1490],
    bottom: false,
    names: ['Essential Piqué Polo', 'Contrast Collar Polo', 'Jersey Zip Polo', 'Striped Rib Polo'],
  },
  {
    code: 'TS',
    name: 'T-shirts',
    price: [450, 790],
    bottom: false,
    names: ['Everyday Crew Tee', 'Heavy Cotton Tee', 'Pocket Tee', 'Oversized Tee'],
  },
  {
    code: 'SH',
    name: 'Shirts',
    price: [1150, 1890],
    bottom: false,
    names: ['Oxford Cotton Shirt', 'Linen Blend Shirt', 'Chambray Shirt'],
  },
  {
    code: 'PJ',
    name: 'Panjabi',
    price: [1650, 3450],
    bottom: false,
    names: ['Classic Cotton Panjabi', 'Embroidered Panjabi', 'Kabli Panjabi'],
  },
  {
    code: 'TR',
    name: 'Trousers',
    price: [1250, 1750],
    bottom: true,
    names: ['Slim Chino Trousers', 'Relaxed Twill Trousers'],
  },
  {
    code: 'DN',
    name: 'Denim',
    price: [1590, 2290],
    bottom: true,
    names: ['Slim Fit Jeans', 'Straight Jeans'],
  },
  {
    code: 'JG',
    name: 'Joggers',
    price: [890, 1290],
    bottom: true,
    names: ['French Terry Jogger', 'Tech Jogger'],
  },
  {
    code: 'HD',
    name: 'Hoodies & sweatshirts',
    price: [1450, 2250],
    bottom: false,
    names: ['Heavyweight Hoodie 320 GSM', 'Zip Hoodie', 'Crew Sweatshirt'],
  },
  {
    code: 'JK',
    name: 'Jackets',
    price: [2450, 3950],
    bottom: false,
    names: ['Bomber Jacket', 'Denim Jacket'],
  },
  {
    code: 'KT',
    name: 'Katua',
    price: [790, 1150],
    bottom: false,
    names: ['Cotton Katua', 'Printed Katua'],
  },
] as const;

export const COLOURS = ['Navy', 'Black', 'White', 'Olive', 'Maroon', 'Grey', 'Sky', 'Beige'] as const;
export const SIZES_TOP = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export const SIZES_BOTTOM = ['30', '32', '34', '36', '38'] as const;

/** Swatch colours for the practice colours (a sample figure, never a brand colour). */
export const COLOUR_HEX: Record<(typeof COLOURS)[number], string> = {
  Navy: '#1F2A44', // hardcode-ok: practice swatch
  Black: '#111111', // hardcode-ok: practice swatch
  White: '#F5F5F5', // hardcode-ok: practice swatch
  Olive: '#556B2F', // hardcode-ok: practice swatch
  Maroon: '#800000', // hardcode-ok: practice swatch
  Grey: '#808080', // hardcode-ok: practice swatch
  Sky: '#87CEEB', // hardcode-ok: practice swatch
  Beige: '#D8C8A8', // hardcode-ok: practice swatch
};

/** A practice product's garment kind decides its store category, size chart and fabric (the closest default-pack category). */
export type GarmentKind = 'tee' | 'shirt' | 'bottom';
export const KIND_BY_CODE: Record<string, { kind: GarmentKind; category: string }> = {
  PL: { kind: 'tee', category: 'polos' },
  TS: { kind: 'tee', category: 'tshirts' },
  SH: { kind: 'shirt', category: 'shirts' },
  PJ: { kind: 'shirt', category: 'panjabi' },
  TR: { kind: 'bottom', category: 'trousers' },
  DN: { kind: 'bottom', category: 'trousers' },
  JG: { kind: 'bottom', category: 'trousers' },
  HD: { kind: 'shirt', category: 'hoodies' },
  JK: { kind: 'shirt', category: 'hoodies' },
  KT: { kind: 'shirt', category: 'panjabi' },
};
export const KINDS: Record<
  GarmentKind,
  {
    garmentType: string;
    fabric: string;
    chart: string;
    columns: string[];
    rows: number[][];
  }
> = {
  tee: {
    garmentType: 'tee',
    fabric: 'Combed cotton jersey (practice)',
    chart: 'Tee, regular fit (practice)',
    columns: ['chest', 'length', 'shoulder', 'sleeve'],
    rows: [
      [38, 27, 16.5, 7.5],
      [40, 28, 17, 8],
      [42, 29, 18, 8.25],
      [44, 30, 19, 8.5],
      [46, 31, 20, 8.75],
    ], // hardcode-ok: sample measurements in inches
  },
  shirt: {
    garmentType: 'shirt',
    fabric: 'Cotton blend (practice)',
    chart: 'Shirt, regular fit (practice)',
    columns: ['chest', 'length', 'shoulder', 'sleeve'],
    rows: [
      [40, 28, 17, 24],
      [42, 29, 18, 25],
      [44, 30, 19, 25.5],
      [46, 31, 20, 26],
      [48, 32, 21, 26.5],
    ], // hardcode-ok: sample measurements in inches
  },
  bottom: {
    garmentType: 'trouser',
    fabric: 'Cotton twill (practice)',
    chart: 'Trouser, regular fit (practice)',
    columns: ['waist', 'hip', 'thigh', 'length', 'legOpening'],
    rows: [
      [30, 38, 23, 40, 8],
      [32, 40, 24, 41, 8.5],
      [34, 42, 25, 41.5, 9],
      [36, 44, 26, 42, 9.5],
      [38, 46, 27, 42.5, 10],
    ], // hardcode-ok: sample measurements in inches
  },
};

/** The prototype's couriers (a practice courier is made for each; none is ever connected). */
export const COURIERS = [
  {
    key: 'pathao',
    name: 'Pathao',
    share: 45,
    fee: { inside: 60, sub: 80, outside: 110 },
  },
  {
    key: 'steadfast',
    name: 'Steadfast',
    share: 40,
    fee: { inside: 60, sub: 70, outside: 110 },
  },
  {
    key: 'redx',
    name: 'RedX',
    share: 15,
    fee: { inside: 65, sub: 85, outside: 120 },
  },
] as const;

/** Payment mix and where orders come from, with the prototype's weights. */
export const PAYMENTS = [
  ['COD', 76],
  ['BKASH', 14],
  ['NAGAD', 6],
  ['CARD', 4],
] as const;
export const CHANNELS = [
  ['WEBSITE', 48],
  ['MESSENGER', 37],
  ['PHONE', 9],
  ['WHATSAPP', 6],
] as const;
export const ADS_SOURCES = [
  ['Facebook ads', 40],
  ['Google', 22],
  ['Organic search', 20],
  ['Direct', 13],
  ['TikTok', 5],
] as const;

export const CANCEL_CODES = ['CUSTOMER_BEFORE_CONFIRM', 'CUSTOMER_AFTER_CONFIRM', 'ADDRESS_UNREACHABLE', 'DUPLICATE_ORDER'] as const;
export const HOLD_CODES = ['no-answer', 'address-unclear', 'customer-wait'] as const;

/** How many of each kind of order the seeder makes (the owner's "80-100 orders over 6 months, all statuses"). */
export const ORDER_PLAN = [
  { kind: 'PLACED', count: 6, age: [0, 1] },
  { kind: 'AWAITING_ADVANCE', count: 2, age: [0, 2] },
  { kind: 'ON_HOLD', count: 2, age: [1, 4] },
  { kind: 'CONFIRMED', count: 5, age: [0, 2] },
  { kind: 'PROCESSING', count: 3, age: [0, 2] },
  { kind: 'BOOKED', count: 5, age: [0, 2] },
  { kind: 'PACKED', count: 4, age: [0, 2] },
  { kind: 'HANDED_OVER', count: 4, age: [1, 3] },
  { kind: 'IN_TRANSIT', count: 3, age: [1, 4] },
  { kind: 'DELIVERED', count: 8, age: [2, 12] },
  { kind: 'PAID', count: 38, age: [4, 178] },
  { kind: 'RETURNED', count: 7, age: [5, 150] },
  { kind: 'CANCELLED', count: 7, age: [0, 170] },
] as const;
export type OrderKind = (typeof ORDER_PLAN)[number]['kind'];
export const ORDER_TOTAL = ORDER_PLAN.reduce((n, p) => n + p.count, 0);

export const PRACTICE_CUSTOMERS = 60; // hardcode-ok: how many sample people the practice data makes
export const PRACTICE_INCOMPLETE = 18; // hardcode-ok: how many started-but-not-finished checkouts the practice data makes

/**
 * PR 724 — the "rich" sample world (screenshots and the side-by-side comparison with the admin prototype only; never the
 * owner's Practice button). It multiplies the plan above so Home, Orders, Products, Couriers, Claims and Reports show real
 * figures: about 850 orders over six months, 240 people, 36 claims, 40 incomplete orders, ad spend for
 * three platforms and ~140 reviews. It only ever runs on the sample store (seed.ts checks the sample marker).
 */
export const RICH = {
  /** orders at the prototype's own counts, see RICH_PLAN */
  customers: 420, // hardcode-ok: sample people (the admin prototype v5 has 420)
  incomplete: 44, // hardcode-ok: sample incomplete checkouts (the prototype has 44)
  claims: 3, // hardcode-ok: sample courier claims (the prototype's claims list holds CL-401 to CL-403)
  /** every style name is made this many times, each with its own series label (27 styles x 4 = 108 products) */
  seriesPerName: ['', 'Black Label', 'Summer Edit', 'Plus Fit'] as const,
  reviews: 64, // hardcode-ok: sample reviews (the prototype has 64)
  adDays: 56, // hardcode-ok: days of ad spend (6 campaigns x 56 days = the prototype's 336 rows)
} as const;

/**
 * PR 1068 (owner, 17 Nov 2026) — the big sample world's orders at the admin prototype v5's own counts: 861 orders over 70
 * days (New 0, Processing 5, Confirmed 9, Booked 2, Packed 5, Handed over 24, Delivered 25, Paid 673, Returned 75,
 * Cancelled 43; the prototype's one bulk order is not made), so a screen of the real admin shows the numbers of the
 * prototype's screen. `age` is days back from now. The recent kinds sit in the last days; Paid, Returned and Cancelled
 * spread over the 70 days (about 12 orders a day, as the prototype's 9 to 17).
 */
export const RICH_PLAN = [
  { kind: 'PROCESSING', count: 5, age: [0, 1] },
  { kind: 'CONFIRMED', count: 9, age: [0, 1] },
  { kind: 'BOOKED', count: 2, age: [0, 1] },
  { kind: 'PACKED', count: 5, age: [0, 2] },
  { kind: 'HANDED_OVER', count: 14, age: [1, 3] },
  { kind: 'IN_TRANSIT', count: 10, age: [1, 4] },
  { kind: 'DELIVERED', count: 25, age: [2, 9] },
  { kind: 'PAID', count: 673, age: [3, 70] },
  { kind: 'RETURNED', count: 75, age: [5, 70] },
  { kind: 'CANCELLED', count: 43, age: [0, 70] },
] as const satisfies readonly { kind: OrderKind; count: number; age: readonly [number, number] }[];
export const RICH_ORDER_TOTAL = RICH_PLAN.reduce((n, p) => n + p.count, 0);

/** The ad accounts and campaigns of the rich sample: platform, daily spend range (whole taka), click-to-order rate. */
export const RICH_ADS = [
  { platform: 'META', account: 'Practice Facebook ads', campaigns: ['Always-on prospecting', 'Retargeting visitors'], spend: [900, 2600], ctr: 0.021, cvr: 0.032 },
  { platform: 'GOOGLE', account: 'Practice Google ads', campaigns: ['Brand search', 'Shopping feed'], spend: [350, 1100], ctr: 0.034, cvr: 0.041 },
  { platform: 'TIKTOK', account: 'Practice TikTok ads', campaigns: ['Short video, new drops', 'Creator clips'], spend: [200, 700], ctr: 0.012, cvr: 0.018 },
] as const;

export const RICH_REVIEW_BODIES = [
  'Fabric feels great and the fit is right.',
  'Good quality for the price, will order again.',
  'Colour is exactly as shown. Delivery was quick.',
  'A little loose on the shoulder, otherwise fine.',
  'Stitching is neat. My size ran true.',
  'Nice and soft, washed twice with no fading.',
  'Slightly long in the sleeve but I like it.',
  'Worth every taka. Friends asked where I bought it.',
] as const;

// ---- PR 725 (15 Nov 2026): the approved demo's catalogue, journal and combos as practice data ------------------------
// `demo-catalogue.json` is the demo's 72 styles (docs/demo/src/01-data.js + 01zz-demo-more.js, made by
// tools/demo/export-demo-catalogue.mjs; prices in minor units, struck prices as `compareAtMinor`, stock per colour and
// size). `demo-extras.json` is its 12 journal posts and 5 combos (made from the same files; one combo names styles the 72 do not hold, so 4 are made). Sample data only.

export interface DemoStyle {
  id: string;
  nameEn: string;
  category: string;
  collection: string;
  tag: string | null;
  template: string;
  sortRank: number;
  descriptionEn: string;
  careEn: string;
  fabric: string;
  fit: string;
  fitNote: string;
  model: string | null;
  freeDelivery: boolean;
  chart: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  colours: string[];
  sizes: string[];
  stock: Record<string, number[]>;
}
export interface DemoPack {
  categories: { slug: string; nameEn: string; nameBn: string; garment: string; hidden: boolean; introEn: string }[];
  colours: { key: string; nameEn: string; hex: string; noteEn: string | null }[];
  sizes: { key: string; label: string; sortOrder: number }[];
  charts: { key: string; name: string; garment: string; fitKey: string; easeInch: number; fields: { key: string; labelEn: string }[]; rows: { size: string; values: number[] }[] }[];
  collections: { slug: string; nameEn: string }[];
  tags: { slug: string; name: string }[];
  products: DemoStyle[];
}
export interface DemoExtras {
  combos: { id: string; name: string; blurb: string; items: string[]; priceMinor: number; autoApply: boolean; sameColour: boolean; template: string }[];
  journal: { title: string; kicker: string; excerpt: string; product: string; colour: string }[];
}
export const DEMO_PACK = catalogueJson as unknown as DemoPack;
export const DEMO_EXTRAS = extrasJson as unknown as DemoExtras;

/** The practice marker in the address of every row the practice world adds beside its flagged ones (collections, tags, combos, posts). */
export const PRACTICE_SLUG = 'practice-'; // hardcode-ok: an ownership prefix, not a text the shop shows

/** Which garment drawing the demo's `garmentSVG` look gives a category (photos.ts). */
export const DRAW_KIND_OF_CATEGORY: Record<string, 'polo' | 'tee' | 'shirt' | 'panjabi' | 'trouser' | 'hoodie'> = {
  polos: 'polo',
  tshirts: 'tee',
  shirts: 'shirt',
  panjabi: 'panjabi',
  trousers: 'trouser',
  joggers: 'trouser',
  hoodies: 'hoodie',
  tracksuits: 'hoodie',
  jackets: 'hoodie',
  sweaters: 'hoodie',
  extras: 'tee',
};

/**
 * PR 1155: the prototype v5's money world, written on the SAMPLE store only (sample-books.ts): the four accounts with the
 * prototype's names and opening balances, the movements' shape (courier payouts, online payments, expenses, the weekly ERP
 * payment and ad bill, the owner taking money once a month), the six staff of Finance › Costs (with this month's bonus,
 * deduction, advance and who is paid) and the nine monthly cost heads. Sample figures only; the pages work every total out.
 */
export const SAMPLE_BOOKS = {
  seed: 20_261_113,
  days: 60,
  accounts: [
    { key: 'cash', nameEn: 'Cash box', nameBn: 'ক্যাশ বাক্স', kind: 'CASH', opening: 15_000 },
    { key: 'bank', nameEn: 'Bank (DBBL)', nameBn: 'ব্যাংক (DBBL)', kind: 'BANK', opening: 420_000 },
    { key: 'bkash', nameEn: 'bKash merchant', nameBn: 'বিকাশ মার্চেন্ট', kind: 'MOBILE', opening: 40_000 },
    { key: 'nagad', nameEn: 'Nagad merchant', nameBn: 'নগদ মার্চেন্ট', kind: 'MOBILE', opening: 30_000 },
  ],
  couriers: [
    { name: 'Pathao', share: 0.8, perParcel: [1_500, 2_100] },
    { name: 'Steadfast', share: 0.7, perParcel: [1_400, 2_000] },
    { name: 'RedX', share: 0.45, perParcel: [1_300, 1_900] },
  ],
  expenses: [
    { note: 'Packaging (practice)', taka: [600, 2_400] },
    { note: 'Transport (practice)', taka: [200, 900] },
    { note: 'Office supplies (practice)', taka: [150, 700] },
  ],
  /** The day of the week (0 = Sunday) the ERP is paid and the ad bill is charged. */
  weekday: 4,
  erpPayment: 70_000,
  adBill: [9_000, 14_000],
  ownerTakeDay: 1,
  ownerTake: 25_000,
  staff: [
    { id: 'practice-arif', name: 'Arif Hossain', post: 'Manager', salary: 26_000, payDay: 7, paid: true },
    { id: 'practice-rafi', name: 'Rafi Ahmed', post: 'Order confirmation caller', salary: 13_000, payDay: 7, paid: true, bonus: 1_000 },
    { id: 'practice-nusrat', name: 'Nusrat Jahan', post: 'Customer support', salary: 13_000, payDay: 7, paid: true, ded: 500 },
    { id: 'practice-sohel', name: 'Sohel Rana', post: 'Packer', salary: 11_000, payDay: 10, paid: false, adv: 3_000 },
    { id: 'practice-jahid', name: 'Jahid Hasan', post: 'Content & photo', salary: 16_000, payDay: 15, paid: false },
    { id: 'practice-tania', name: 'Tania Akter', post: 'Ads manager', salary: 22_000, payDay: 15, paid: false },
  ] as { id: string; name: string; post: string; salary: number; payDay: number; paid: boolean; bonus?: number; ded?: number; adv?: number }[],
  heads: [
    { id: 'practice-rent', name: 'Office & warehouse rent', kind: 'rent', taka: 30_000, payDay: 5 },
    { id: 'practice-power', name: 'Electricity', kind: 'utilities', taka: 6_500, payDay: 10 },
    { id: 'practice-net', name: 'Internet', kind: 'utilities', taka: 3_000, payDay: 10 },
    { id: 'practice-mobile', name: 'Mobile bills', kind: 'utilities', taka: 2_500, payDay: 10 },
    { id: 'practice-soft', name: 'Software & subscriptions', kind: 'other', taka: 9_000, payDay: 3, note: 'Software' },
    { id: 'practice-acct', name: 'Accountant fee', kind: 'other', taka: 5_000, payDay: 25 },
    { id: 'practice-transport', name: 'Transport & conveyance', kind: 'other', taka: 4_000, payDay: 28 },
    { id: 'practice-clean', name: 'Cleaning & maintenance', kind: 'other', taka: 2_500, payDay: 20 },
    { id: 'practice-eid', name: 'Eid bonus provision', kind: 'other', taka: 8_400, payDay: 28 },
  ] as { id: string; name: string; kind: 'rent' | 'utilities' | 'other'; taka: number; payDay: number; note?: string }[],
};

/**
 * PR 1156: the prototype v5's customer questions (on practice products; `product` is the index in the practice products,
 * `hoursAgo` how long ago it was asked) and its marketing calendar lines (days from today, so the sample store always has a
 * past, a current and a coming month; sample store only).
 */
export const SAMPLE_EXTRAS = {
  /** PR 1156: why practice parcels came back (the reason code's words show as "Wrong size refused", "Address not found" …). */
  returns: [
    { code: 'WRONG_SIZE_REFUSED', kind: 'REFUSED_AT_DOOR', share: 30 },
    { code: 'CUSTOMER_REFUSED_AT_DOOR', kind: 'REFUSED_AT_DOOR', share: 25 },
    { code: 'CUSTOMER_NOT_REACHABLE', kind: 'RETURNED', share: 20 },
    { code: 'CHANGED_MIND', kind: 'REFUSED_AT_DOOR', share: 15 },
    { code: 'ADDRESS_NOT_FOUND', kind: 'RETURNED', share: 10 },
  ] as { code: string; kind: 'REFUSED_AT_DOOR' | 'RETURNED'; share: number }[],
  questions: [
    { product: 0, hoursAgo: 5, text: 'Is this available in XXL in navy?' },
    { product: 3, hoursAgo: 26, text: 'Will the colour fade after washing?' },
    { product: 30, hoursAgo: 50, text: 'What is the chest size of L?', answer: 'L chest is 42 inches. Size chart is on the page.' },
    { product: 71, hoursAgo: 3, text: 'Can I get this before Friday in Sylhet?' },
  ] as { product: number; hoursAgo: number; text: string; answer?: string }[],
  calendar: [
    { title: 'Durga Puja', from: -27, to: -23, type: 'holiday' },
    { title: 'Puja offer · PUJA15', from: -34, to: -19, type: 'offer' },
    { title: 'Winter Polo Launch ads', from: -12, to: 17, type: 'ad' },
    { title: 'Winter polo week (12% off)', from: -5, to: 2, type: 'offer' },
    { title: '11.11 shopping day', from: -2, to: -2, type: 'day' },
    { title: 'SMS: Free delivery weekend', from: 1, to: 1, type: 'msg' },
    { title: 'Blog: Cotton vs linen', from: 5, to: 5, type: 'post' },
    { title: 'Panjabi pre-order offer', from: 7, to: 27, type: 'offer' },
    { title: 'Black Friday', from: 14, to: 14, type: 'day' },
    { title: 'Victory Day collection ads', from: 25, to: 33, type: 'ad' },
    { title: 'Victory Day', from: 33, to: 33, type: 'holiday' },
    { title: 'Christmas', from: 42, to: 42, type: 'day' },
    { title: 'Year-end sale', from: 43, to: 48, type: 'offer' },
    { title: 'Ramadan starts (expected)', from: 88, to: 88, type: 'holiday' },
    { title: 'Pohela Falgun & Valentine’s', from: 93, to: 93, type: 'day' },
    { title: 'Language Day', from: 100, to: 100, type: 'holiday' },
    { title: 'Eid panjabi ads', from: 94, to: 114, type: 'ad' },
    { title: 'Eid ul-Fitr (expected)', from: 117, to: 117, type: 'holiday' },
  ] as { title: string; from: number; to: number; type: string }[],
};
