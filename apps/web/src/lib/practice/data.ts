// S28 · PR 706 (CN-049) — the practice (sample) data: the admin prototype v5's own names, areas, products, prices, couriers
// and rules (docs/demo/admin-proto-v5/js/core.js), in one place. Nothing here is a real person: names are the
// prototype's made-up ones and every phone number sits in a reserved range no operator uses (PRACTICE_PHONE_PREFIX).
// The amounts are the prototype's sample figures in whole taka (the seeder converts them to the store's minor units).

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
  ['COD', 78],
  ['BKASH', 14],
  ['NAGAD', 5],
  ['CARD', 3],
] as const;
export const CHANNELS = [
  ['WEBSITE', 46],
  ['MESSENGER', 38],
  ['PHONE', 10],
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
