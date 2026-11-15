// S28 · PR 706 — pictures for the practice products, drawn the way the approved demo draws them (docs/demo/src/02-core.js
// `garmentSVG`: a flat garment in the product's colour on a soft tint of that colour; views front, back, detail, on model).
// They are REAL stored files: the drawing is turned into a PNG with sharp, kept through the storage adapter like any
// upload, recorded as a library file (folder "practice") and placed on the product, and the shop sizes (renditions) are
// made by the normal image job. So the admin list, the product page and the shop show a picture, never a broken one.
// Idempotent: a photo already on a product (same kind, same colour) is not made again. Every row is practice-owned
// (folder "practice", on a practice product), so `resetPractice` removes exactly those.
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  originalKey,
  isRenditionKey,
  photoRules,
  renderAsset,
  type MediaDeps,
} from "@extas/media";
import { CATEGORIES, DRAW_KIND_OF_CATEGORY } from "./data";

export type DrawKind =
  "polo" | "tee" | "shirt" | "panjabi" | "trouser" | "hoodie";
export type DrawView = "front" | "back" | "detail" | "model";

export const PRACTICE_MEDIA_FOLDER = "practice";

type PhotoStorage = Awaited<ReturnType<MediaDeps["storage"]>>;

/**
 * A picture is only used on a product once its files are really in storage: the original and every size the shop asks for
 * (the sizes recorded in the library, each looked up by the same key the /media route serves). A missing file is a 404 on a
 * live page, so nothing is linked, and an already linked picture is repaired (below), never left pointing at nothing.
 */
export async function assetFilesExist(
  db: MediaDeps["db"],
  storage: PhotoStorage,
  asset: { id: string; storageKey: string },
): Promise<boolean> {
  if (!(await storage.head(asset.storageKey))) return false;
  const sizes = await db.mediaRendition.findMany({ where: { assetId: asset.id }, select: { storageKey: true } });
  if (!sizes.length) return false;
  // a size under a name the /media route refuses (capital letters in the name) is as good as missing
  for (const r of sizes) if (!isRenditionKey(r.storageKey) || !(await storage.head(r.storageKey))) return false;
  return true;
}

/** Without a shared disk (or Blob) a picture lives in one server process's memory: the other servers would answer 404. */
export function storageIsPerProcess(storage: PhotoStorage): boolean {
  return storage.volatile === true && process.env.NODE_ENV === "production";
}

/** Category code → the demo's garment drawing (denim and joggers are trousers, jackets a hoodie, katua a short panjabi). */
const KIND_OF: Record<string, DrawKind> = {
  PL: "polo",
  TS: "tee",
  SH: "shirt",
  PJ: "panjabi",
  TR: "trouser",
  DN: "trouser",
  JG: "trouser",
  HD: "hoodie",
  JK: "hoodie",
  KT: "panjabi",
};

const SIZE = { width: 1200, height: 1500 } as const; // hardcode-ok: the demo's 4:5 frame at 2x of a 600 px card

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
/** The demo's mixHex: `a` blended towards `b` by `t`. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x
    .map((v, i) =>
      clamp(v + (y[i]! - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export const isLight = (hex: string): boolean => {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160; // hardcode-ok: the demo's lightness test
};

/** The demo's garmentSVG shapes, copied path for path. */
function garment(type: DrawKind, hex: string, view: DrawView): string {
  const dark = mixHex(hex, "#000000", 0.28);
  const light = isLight(hex);
  const line = light ? "rgba(0,0,0,.28)" : "rgba(255,255,255,.22)";
  const det = light ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.30)";
  const back = view === "back";
  let g = "";
  if (type === "polo" || type === "tee") {
    g += `<path d="M62 22 L82 12 Q100 28 118 12 L138 22 L178 46 L162 82 L146 74 L146 208 L54 208 L54 74 L38 82 L22 46 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    g += `<path d="M54 196 L146 196" stroke="${det}" stroke-width="1.2"/><path d="M38 82 L54 74 M162 82 L146 74" stroke="${det}" stroke-width="1.2"/>`;
    if (type === "polo" && !back) {
      g += `<path d="M82 12 L100 38 L118 12 L111 9 Q100 20 89 9 Z" fill="${dark}" opacity=".55"/>`;
      g += `<path d="M82 12 L70 30 L94 30 Z M118 12 L130 30 L106 30 Z" fill="${hex}" stroke="${line}" stroke-width="1.2"/>`;
      g += `<path d="M100 38 L100 72" stroke="${det}" stroke-width="1.4"/><circle cx="100" cy="50" r="2.2" fill="${det}"/><circle cx="100" cy="63" r="2.2" fill="${det}"/>`;
    } else if (type === "tee")
      g += `<path d="M82 12 Q100 30 118 12" fill="none" stroke="${det}" stroke-width="3"/>`;
    else
      g += `<path d="M82 12 Q100 18 118 12" fill="none" stroke="${det}" stroke-width="5"/>`;
  } else if (type === "shirt") {
    g += `<path d="M64 22 L84 12 L100 30 L116 12 L136 22 L174 50 L186 156 L168 160 L154 86 L150 210 L50 210 L46 86 L32 160 L14 156 L26 50 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    if (!back) {
      g += `<path d="M84 12 L100 30 L116 12 L108 8 L100 18 L92 8 Z" fill="${mixHex(hex, "#ffffff", 0.25)}" stroke="${line}" stroke-width="1"/><path d="M100 30 L100 206" stroke="${det}" stroke-width="1.4"/>`;
      for (let i = 0; i < 6; i++)
        g += `<circle cx="103.5" cy="${48 + i * 26}" r="2" fill="${det}"/>`;
      g += `<rect x="62" y="64" width="22" height="18" fill="none" stroke="${det}" stroke-width="1.1"/>`;
    }
    g += `<path d="M168 160 L186 156 M14 156 L32 160" stroke="${det}" stroke-width="2"/>`;
  } else if (type === "panjabi") {
    g += `<path d="M68 20 L86 12 Q100 18 114 12 L132 20 L168 46 L180 156 L164 158 L152 80 L152 216 L48 216 L48 80 L36 158 L20 156 L32 46 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    if (!back) {
      g += `<path d="M88 11 Q100 17 112 11 L112 16 Q100 22 88 16 Z" fill="${dark}" opacity=".5"/><path d="M100 18 L100 86" stroke="${det}" stroke-width="1.4"/>`;
      for (let j = 0; j < 4; j++)
        g += `<circle cx="100" cy="${30 + j * 15}" r="2" fill="${det}"/>`;
    }
    g += `<path d="M48 200 L60 216 M152 200 L140 216" stroke="${det}" stroke-width="1.2"/>`;
  } else if (type === "hoodie") {
    g += `<path d="M62 30 L80 20 L120 20 L138 30 L174 54 L186 160 L168 164 L154 90 L152 206 L48 206 L46 90 L32 164 L14 160 L26 54 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    g += `<path d="M74 28 Q100 -8 126 28 L120 46 Q100 58 80 46 Z" fill="${mixHex(hex, "#000000", 0.12)}" stroke="${line}" stroke-width="1.2"/>`;
    if (!back)
      g += `<path d="M92 52 L90 84 M108 52 L110 84" stroke="${det}" stroke-width="1.6"/><path d="M68 140 L132 140 L142 186 L58 186 Z" fill="none" stroke="${det}" stroke-width="1.4"/>`;
    g += `<path d="M48 194 L152 194 M168 164 L186 160 M14 160 L32 164" stroke="${det}" stroke-width="2"/>`;
  } else {
    g += `<path d="M58 10 L142 10 L152 212 L112 212 L100 74 L88 212 L48 212 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    g += `<path d="M58 24 L142 24" stroke="${det}" stroke-width="1.6"/><path d="M100 24 L100 74" stroke="${det}" stroke-width="1.2"/>`;
    if (!back)
      g += `<path d="M62 26 Q72 50 86 30 M138 26 Q128 50 114 30" fill="none" stroke="${det}" stroke-width="1.2"/>`;
    else
      g += `<rect x="66" y="40" width="22" height="22" fill="none" stroke="${det}" stroke-width="1.1"/><rect x="112" y="40" width="22" height="22" fill="none" stroke="${det}" stroke-width="1.1"/>`;
  }
  const tr =
    view === "detail" ? ' transform="translate(-100 -10) scale(2)"' : "";
  return `<g${tr}>${g}</g>`;
}

/** One picture as SVG text: the garment on the demo's tint of its colour (a deeper tint for the on-model view). */
export function drawingSvg(
  kind: DrawKind,
  hex: string,
  view: DrawView,
): string {
  const bg =
    view === "model"
      ? mixHex(hex, "#D9D5CE", 0.86)
      : mixHex(hex, "#EFEDE8", isLight(hex) ? 0.55 : 0.8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.width}" height="${SIZE.height}" viewBox="0 0 200 250"><rect width="200" height="250" fill="${bg}"/><g transform="translate(0 14)">${garment(kind, hex, view)}</g></svg>`;
}

/** The picture as a PNG file (the same bytes for the same kind, colour and view). */
export async function drawingPng(
  kind: DrawKind,
  hex: string,
  view: DrawView,
): Promise<Buffer> {
  return sharp(Buffer.from(drawingSvg(kind, hex, view)), { density: 72 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

type Role = "FRONT" | "BACK" | "DETAIL" | "ON_MODEL";
const VIEW_OF: Record<Role, DrawView> = {
  FRONT: "front",
  BACK: "back",
  DETAIL: "detail",
  ON_MODEL: "model",
};
const WORDS: Record<Role, string> = {
  FRONT: "front",
  BACK: "back",
  DETAIL: "detail",
  ON_MODEL: "on model",
};

type Wanted = { role: Role; colourId: string; hex: string };
interface PlanItem {
  id: string;
  name: string;
  kind: DrawKind;
  firstColourId: string;
  missing: Wanted[];
  have: number;
}

/**
 * What every practice product still lacks: a front photo in each of its colours, and a back, a detail and an on-model
 * photo (in its first colour). Reads the database only (nothing is drawn), so it also gives the progress figures.
 */
async function photoPlan(db: MediaDeps["db"], storeId: number, minimum: number): Promise<PlanItem[]> {
  const products = await db.product.findMany({
    where: { storeId, isPractice: true, archivedAt: null },
    select: {
      id: true,
      nameEn: true,
      category: { select: { slug: true } },
      colours: {
        where: { archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { colourId: true, colour: { select: { hex: true } } },
      },
    },
    orderBy: { slug: "asc" },
  });
  const media = await db.productMedia.findMany({
    where: {
      storeId,
      archivedAt: null,
      product: { isPractice: true },
      asset: { folder: PRACTICE_MEDIA_FOLDER },
    },
    select: { productId: true, role: true, colourId: true },
  });
  const byProduct = new Map<string, { role: string; colourId: string | null }[]>();
  for (const m of media) {
    const list = byProduct.get(m.productId) ?? [];
    list.push(m);
    byProduct.set(m.productId, list);
  }
  const out: PlanItem[] = [];
  for (const p of products) {
    const name = p.nameEn.replace(/ \(practice\)$/, "");
    // the demo's garment drawing for the style's category (the older generic styles by their name's category code)
    const code = CATEGORIES.find((c) =>
      (c.names as readonly string[]).includes(name),
    )?.code;
    const kind: DrawKind =
      (p.category && DRAW_KIND_OF_CATEGORY[p.category.slug]) ||
      (code && KIND_OF[code]) ||
      "tee";
    const cols = p.colours.filter((c) => c.colour.hex);
    if (!cols.length) continue;
    const have = byProduct.get(p.id) ?? [];
    const done = new Set(have.map((h) => `${h.role}:${h.colourId ?? ""}`));
    const first = cols[0]!;
    const wanted: Wanted[] = [
      ...cols.map((c) => ({
        role: "FRONT" as Role,
        colourId: c.colourId,
        hex: c.colour.hex!,
      })),
      ...(["BACK", "DETAIL", "ON_MODEL"] as Role[]).map((role) => ({
        role,
        colourId: first.colourId,
        hex: first.colour.hex!,
      })),
    ];
    // a very small set rule (minimum above what the kinds give) is met with extra back views in the other colours
    for (const c of cols.slice(1))
      if (wanted.length < minimum)
        wanted.push({ role: "BACK", colourId: c.colourId, hex: c.colour.hex! });
    out.push({
      id: p.id,
      name,
      kind,
      firstColourId: first.colourId,
      missing: wanted.filter((w) => !done.has(`${w.role}:${w.colourId}`)),
      have: have.length,
    });
  }
  return out;
}

export interface PhotoProgress {
  /** Photos added by this call. */
  photos: number;
  /** Practice products that get pictures (the ones with a colour). */
  total: number;
  /** Of those, how many have their whole set. */
  done: number;
  /** True when every practice product has its whole set (nothing left to make). */
  complete: boolean;
  /** Set when no picture was made because the files would not last (storage lives in one process's memory only). */
  blocked?: "per-process-storage";
}

/** "x of y products done" without drawing anything. */
export async function practicePhotoProgress(
  db: MediaDeps["db"],
  storeId: number,
  minimum: number,
): Promise<Omit<PhotoProgress, "photos" | "complete">> {
  const plan = await photoPlan(db, storeId, minimum);
  return { total: plan.length, done: plan.filter((p) => !p.missing.length).length };
}

/**
 * Gives practice products the photo set the shop asks for. `limit` = how many products to finish in this call (all when
 * not given; the "Add practice photos" button, PR 720); `maxPhotos` = at most this many pictures in this call (the
 * automatic fill, PR 725, makes them in small steps). A call never repeats work, so the next call simply continues where
 * the last one stopped. Returns how many photos it added (0 on a second run) and the progress.
 */
export async function addPracticePhotos(
  deps: MediaDeps,
  storeId: number,
  opts: { limit?: number; maxPhotos?: number } = {},
): Promise<PhotoProgress> {
  const rules = await photoRules(deps.settings, storeId);
  const plan = await photoPlan(deps.db, storeId, rules.minimum);
  const pending = plan.filter((p) => p.missing.length);
  const batch = opts.limit && opts.limit > 0 ? pending.slice(0, opts.limit) : pending;
  const storage = await deps.storage(storeId);
  if (pending.length && storageIsPerProcess(storage)) {
    return { photos: 0, total: plan.length, done: plan.length - pending.length, complete: false, blocked: "per-process-storage" };
  }
  const now = deps.now ? deps.now() : new Date();
  const max = opts.maxPhotos ?? Number.POSITIVE_INFINITY;
  let added = 0;
  let finishedNow = 0;
  for (const p of batch) {
    if (added >= max) break;
    let sort = p.have;
    let left = p.missing.length;
    for (const w of p.missing) {
      if (added >= max) break;
      const body = await drawingPng(p.kind, w.hex, VIEW_OF[w.role]);
      const checksum = createHash("sha256").update(body).digest("hex");
      let asset = await deps.db.mediaAsset.findFirst({
        where: {
          storeId,
          checksumSha256: checksum,
          isOriginal: true,
          folder: PRACTICE_MEDIA_FOLDER,
        },
      });
      if (!asset) {
        const slug = `practice-${p.kind}-${w.hex.slice(1).toLowerCase()}-${VIEW_OF[w.role]}`;
        const key = originalKey({
          storeId,
          checksum,
          slug,
          ext: "png",
          at: now,
        });
        await storage.put(key, body, "image/png");
        asset = await deps.db.mediaAsset.create({
          data: {
            storeId,
            kind: "IMAGE",
            storage: storage.provider,
            storageKey: key,
            originalFileName: `${slug}.png`,
            mimeType: "image/png",
            bytes: BigInt(body.byteLength),
            width: SIZE.width,
            height: SIZE.height,
            checksumSha256: checksum,
            isOriginal: true,
            altEn: `${p.name}, ${WORDS[w.role]}`,
            folder: PRACTICE_MEDIA_FOLDER,
            tags: ["practice"],
            createdAt: now,
          },
        });
        await renderAsset(deps, asset.id);
      }
      if (!(await assetFilesExist(deps.db, storage, asset))) {
        // an older run left this picture without its files (or the sizes are not all there): put them back before using it
        await storage.put(asset.storageKey, body, "image/png");
        await renderAsset(deps, asset.id, { force: true });
        if (!(await assetFilesExist(deps.db, storage, asset))) {
          throw new Error(`practice picture ${asset.id}: its files are not in storage, so it is not placed on a product`);
        }
      }
      await deps.db.productMedia.create({
        data: {
          storeId,
          productId: p.id,
          assetId: asset.id,
          role: w.role,
          colourId: w.colourId,
          sortOrder: sort++,
          isPrimary: w.role === "FRONT" && w.colourId === p.firstColourId,
        },
      });
      added++;
      left--;
    }
    if (left === 0) finishedNow++;
  }
  const done = plan.length - pending.length + finishedNow;
  return { photos: added, total: plan.length, done, complete: done >= plan.length };
}


/** "practice-polo-1F2A44-front" → what to draw again (the file name every practice picture is saved under). */
export function drawingOfName(fileName: string | null): { kind: DrawKind; hex: string; view: DrawView } | null {
  const m = /^practice-(polo|tee|shirt|panjabi|trouser|hoodie)-([0-9A-Fa-f]{6})-(front|back|detail|model)\.png$/.exec(fileName ?? "");
  return m ? { kind: m[1] as DrawKind, hex: `#${m[2]}`, view: m[3] as DrawView } : null;
}

/**
 * Repairs practice pictures whose files are gone from storage (a server that lost its disk, or files made when the
 * storage was not shared): draws the same picture again (same bytes, same checksum), puts it back under its own key and
 * makes the sizes again. Looks at `batch` pictures per call, after `after` (the id to continue from); returns where it
 * stopped (null at the end), how many it looked at and how many it repaired.
 */
export async function repairPracticePhotos(
  deps: MediaDeps,
  storeId: number,
  opts: { after?: string | null; batch?: number } = {},
): Promise<{ checked: number; repaired: number; next: string | null }> {
  const storage = await deps.storage(storeId);
  if (storageIsPerProcess(storage)) return { checked: 0, repaired: 0, next: null };
  const batch = opts.batch ?? 25; // hardcode-ok: a technical step size
  const rows = await deps.db.mediaAsset.findMany({
    where: { storeId, folder: PRACTICE_MEDIA_FOLDER, isOriginal: true, kind: "IMAGE", archivedAt: null, ...(opts.after ? { id: { gt: opts.after } } : {}) },
    orderBy: { id: "asc" },
    take: batch,
    select: { id: true, storageKey: true, originalFileName: true, checksumSha256: true },
  });
  let repaired = 0;
  for (const a of rows) {
    if (await assetFilesExist(deps.db, storage, a)) continue;
    const d = drawingOfName(a.originalFileName);
    if (!d) continue;
    const body = await drawingPng(d.kind, d.hex, d.view);
    if (createHash("sha256").update(body).digest("hex") !== a.checksumSha256) continue;
    await storage.put(a.storageKey, body, "image/png");
    await renderAsset(deps, a.id, { force: true });
    repaired++;
  }
  return { checked: rows.length, repaired, next: rows.length === batch ? rows[rows.length - 1]!.id : null };
}

/**
 * PR 764 — a practice size asked for at its address whose file is not in storage (an older run, a lost disk): the picture
 * is drawn again, put back under its own key and its sizes are made again, then the size asked for is returned from its
 * (now current, lower-case) record. Only a practice picture is ever healed; anything else, or a picture that cannot be
 * drawn again to the same bytes, gives null (the route answers 404). Safe to repeat.
 */
export async function healPracticeRendition(
  deps: MediaDeps,
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const r = await deps.db.mediaRendition.findFirst({
    where: { storageKey: key },
    select: { assetId: true, preset: true, format: true, asset: { select: { id: true, storeId: true, storage: true, storageKey: true, originalFileName: true, checksumSha256: true, folder: true, archivedAt: true, isOriginal: true } } },
  });
  const a = r?.asset;
  if (!r || !a || a.archivedAt || a.folder !== PRACTICE_MEDIA_FOLDER || !a.isOriginal) return null;
  const storage = await deps.storage(a.storeId, a.storage);
  if (storageIsPerProcess(storage)) return null;
  const d = drawingOfName(a.originalFileName);
  if (!d) return null;
  const body = await drawingPng(d.kind, d.hex, d.view);
  if (createHash("sha256").update(body).digest("hex") !== a.checksumSha256) return null;
  await storage.put(a.storageKey, body, "image/png");
  await renderAsset(deps, a.id, { force: true });
  const now = await deps.db.mediaRendition.findUnique({ where: { assetId_preset_format: { assetId: r.assetId, preset: r.preset, format: r.format } }, select: { storageKey: true } });
  if (!now || !isRenditionKey(now.storageKey)) return null;
  const f = await storage.get(now.storageKey);
  return f ? { body: f.body, contentType: `image/${r.format}` } : null;
}
