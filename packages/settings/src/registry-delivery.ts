// S06 · PR 549–553, 555 — the delivery-zone engine (Gyani; @extas/delivery). Every switch, wait and limit of the
// gazetteer, the band map, the resolver, the autocomplete and phone-first recognition lives here, never in code.
// Labels: messages/delivery.<lang>.json. Registry version 15.
//
// The charges themselves are not settings: each band's charge, its delivery hours and whether it is on are the owner's
// figures in the DeliveryBand rows (PR 508 seeds the three bands switched off with no charge), and the sub-area list is
// the owner's AreaBand rows (PR 509 register: owner data). Both ship empty and are typed in by the owner in the admin.
import { z } from 'zod';
import { setting } from './define';

const V = 15;

/** A band row's key (DeliveryBand.key), e.g. `dhaka-city`. */
export const bandKeySchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'a band key is lower-case words joined by hyphens' })
  .max(60);

/** A city-corporation tag of the gazetteer (GeoArea.cityCorporation), e.g. `DNCC`. */
export const cityCorporationSchema = z.string().regex(/^[A-Z]{2,10}$/, { message: 'a city corporation is 2–10 capital letters, e.g. DNCC' });

export const deliverySettings = {
  // ---- PR 550 · band mapping: which band row is the city, the sub-area and the outside band (the default pack's
  // keys), and which city corporations make up the city band (Dhaka City = DNCC + DSCC, the official map). ----
  'delivery.bands.cityKey': setting({
    schema: bandKeySchema,
    default: 'dhaka-city',
    scope: 'store',
    valueType: 'STRING',
    group: 'delivery',
    labelKey: 'delivery.bands.cityKey.label',
    helpKey: 'delivery.bands.cityKey.help',
    isOwnerData: false,
    sortOrder: 400,
    version: V,
  }),
  'delivery.bands.subAreaKey': setting({
    schema: bandKeySchema,
    default: 'dhaka-sub-area',
    scope: 'store',
    valueType: 'STRING',
    group: 'delivery',
    labelKey: 'delivery.bands.subAreaKey.label',
    helpKey: 'delivery.bands.subAreaKey.help',
    isOwnerData: false,
    sortOrder: 410,
    version: V,
  }),
  'delivery.bands.outsideKey': setting({
    schema: bandKeySchema,
    default: 'outside-dhaka',
    scope: 'store',
    valueType: 'STRING',
    group: 'delivery',
    labelKey: 'delivery.bands.outsideKey.label',
    helpKey: 'delivery.bands.outsideKey.help',
    isOwnerData: false,
    sortOrder: 420,
    version: V,
  }),
  'delivery.bands.cityCorporations': setting({
    schema: z
      .array(cityCorporationSchema)
      .min(1)
      .max(20)
      .refine((l) => new Set(l).size === l.length, { message: 'each city corporation once' }),
    default: ['DNCC', 'DSCC'],
    scope: 'store',
    valueType: 'JSON',
    group: 'delivery',
    labelKey: 'delivery.bands.cityCorporations.label',
    helpKey: 'delivery.bands.cityCorporations.help',
    isOwnerData: false,
    sortOrder: 430,
    version: V,
  }),
  'delivery.bands.searchLimit': setting({
    schema: z.int().min(1).max(50),
    default: 12,
    scope: 'store',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.bands.searchLimit.label',
    helpKey: 'delivery.bands.searchLimit.help',
    isOwnerData: false,
    sortOrder: 440,
    version: V,
  }),
  // ---- PR 551 · the resolver: it waits for the whole line (blur, or a pause once the line has enough words) ----
  'delivery.resolver.settleMs': setting({
    schema: z.int().min(200).max(10_000),
    default: 900,
    scope: 'store',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.resolver.settleMs.label',
    helpKey: 'delivery.resolver.settleMs.help',
    isOwnerData: false,
    sortOrder: 450,
    version: V,
  }),
  'delivery.resolver.minWords': setting({
    schema: z.int().min(1).max(10),
    default: 2,
    scope: 'store',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.resolver.minWords.label',
    helpKey: 'delivery.resolver.minWords.help',
    isOwnerData: false,
    sortOrder: 451,
    version: V,
  }),
  'delivery.resolver.minKeyChars': setting({
    schema: z.int().min(2).max(10),
    default: 3,
    scope: 'installation',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.resolver.minKeyChars.label',
    helpKey: 'delivery.resolver.minKeyChars.help',
    isOwnerData: false,
    sortOrder: 452,
    version: V,
  }),
  'delivery.resolver.numberLabels': setting({
    schema: z.array(z.string().trim().min(1).max(30)).max(100),
    default: [
      'house',
      'h',
      'road',
      'rd',
      'sector',
      'sec',
      'block',
      'flat',
      'plot',
      'holding',
      'lane',
      'level',
      'floor',
      'apt',
      'apartment',
      'no',
      'বাড়ি',
      'বাসা',
      'রোড',
      'সেক্টর',
      'ব্লক',
      'ফ্ল্যাট',
      'প্লট',
      'লেন',
      'হোল্ডিং',
      'নং',
    ],
    scope: 'installation',
    valueType: 'JSON',
    group: 'delivery',
    labelKey: 'delivery.resolver.numberLabels.label',
    helpKey: 'delivery.resolver.numberLabels.help',
    isOwnerData: false,
    sortOrder: 453,
    version: V,
  }),
  'delivery.resolver.maxChars': setting({
    schema: z.int().min(40).max(2000),
    default: 300,
    scope: 'installation',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.resolver.maxChars.label',
    helpKey: 'delivery.resolver.maxChars.help',
    isOwnerData: false,
    sortOrder: 454,
    version: V,
  }),
  'delivery.public.maxBodyBytes': setting({
    schema: z.int().min(256).max(65_536),
    default: 4096,
    scope: 'installation',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.public.maxBodyBytes.label',
    helpKey: 'delivery.public.maxBodyBytes.help',
    isOwnerData: false,
    sortOrder: 490,
    version: V,
  }),
  // ---- PR 552 · address autocomplete: prefix type-ahead over the gazetteer, each row with its district and charge ----
  'delivery.suggest.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'delivery',
    labelKey: 'delivery.suggest.enabled.label',
    helpKey: 'delivery.suggest.enabled.help',
    isOwnerData: false,
    sortOrder: 460,
    version: V,
  }),
  'delivery.suggest.minChars': setting({
    schema: z.int().min(1).max(10),
    default: 2,
    scope: 'store',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.suggest.minChars.label',
    helpKey: 'delivery.suggest.minChars.help',
    isOwnerData: false,
    sortOrder: 461,
    version: V,
  }),
  'delivery.suggest.limit': setting({
    schema: z.int().min(1).max(20),
    default: 8,
    scope: 'store',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.suggest.limit.label',
    helpKey: 'delivery.suggest.limit.help',
    isOwnerData: false,
    sortOrder: 462,
    version: V,
  }),
  // ---- PR 549 · the national gazetteer ----
  'delivery.gazetteer.cacheSeconds': setting({
    schema: z.int().min(10).max(86_400),
    default: 300,
    scope: 'installation',
    valueType: 'DURATION_SECONDS',
    group: 'delivery',
    labelKey: 'delivery.gazetteer.cacheSeconds.label',
    helpKey: 'delivery.gazetteer.cacheSeconds.help',
    isOwnerData: false,
    sortOrder: 500,
    version: V,
  }),
};
