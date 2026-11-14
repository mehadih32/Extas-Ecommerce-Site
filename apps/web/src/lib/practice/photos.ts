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
  photoRules,
  renderAsset,
  type MediaDeps,
} from "@extas/media";
import { CATEGORIES } from "./data";

export type DrawKind =
  "polo" | "tee" | "shirt" | "panjabi" | "trouser" | "hoodie";
export type DrawView = "front" | "back" | "detail" | "model";

export const PRACTICE_MEDIA_FOLDER = "practice";

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

/**
 * Gives every practice product the photo set the shop asks for: a front photo in each of its colours, and a back, a
 * detail and an on-model photo (in its first colour). Returns how many photos it added (0 on a second run).
 */
export async function addPracticePhotos(
  deps: MediaDeps,
  storeId: number,
): Promise<{ photos: number }> {
  const rules = await photoRules(deps.settings, storeId);
  const products = await deps.db.product.findMany({
    where: { storeId, isPractice: true },
    select: {
      id: true,
      nameEn: true,
      productColours: {
        where: { archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { colourId: true, colour: { select: { hex: true } } },
      },
    },
    orderBy: { slug: "asc" },
  });
  const storage = await deps.storage(storeId);
  const now = deps.now ? deps.now() : new Date();
  let added = 0;
  for (const p of products) {
    const name = p.nameEn.replace(/ \(practice\)$/, "");
    const code = CATEGORIES.find((c) =>
      (c.names as readonly string[]).includes(name),
    )?.code;
    const kind = (code && KIND_OF[code]) || "tee";
    const cols = p.productColours.filter((c) => c.colour.hex);
    if (!cols.length) continue;
    const have = await deps.db.productMedia.findMany({
      where: {
        productId: p.id,
        archivedAt: null,
        asset: { folder: PRACTICE_MEDIA_FOLDER },
      },
      select: { role: true, colourId: true },
    });
    const done = new Set(have.map((h) => `${h.role}:${h.colourId ?? ""}`));
    const first = cols[0]!;
    const wanted: { role: Role; colourId: string; hex: string }[] = [
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
      if (wanted.length < rules.minimum)
        wanted.push({ role: "BACK", colourId: c.colourId, hex: c.colour.hex! });
    let sort = have.length;
    for (const w of wanted) {
      if (done.has(`${w.role}:${w.colourId}`)) continue;
      const body = await drawingPng(kind, w.hex, VIEW_OF[w.role]);
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
        const slug = `practice-${kind}-${w.hex.slice(1)}-${VIEW_OF[w.role]}`;
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
            altEn: `${name}, ${WORDS[w.role]}`,
            folder: PRACTICE_MEDIA_FOLDER,
            tags: ["practice"],
            createdAt: now,
          },
        });
        await renderAsset(deps, asset.id);
      }
      await deps.db.productMedia.create({
        data: {
          storeId,
          productId: p.id,
          assetId: asset.id,
          role: w.role,
          colourId: w.colourId,
          sortOrder: sort++,
          isPrimary: w.role === "FRONT" && w.colourId === first.colourId,
        },
      });
      added++;
    }
  }
  return { photos: added };
}
