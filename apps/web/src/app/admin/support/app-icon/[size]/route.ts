// S22 · PR 435 — the support app's icon as a PNG in the sizes the manifest and Apple ask for (192, 512, 180): a chat
// bubble in the admin's colours on a full square (the phone cuts its own shape; the bubble sits inside the safe middle
// so a "maskable" cut never clips it). Drawn once per size by sharp and cached by the browser.
import sharp from 'sharp';
import { SUPPORT_APP_COLOURS, SUPPORT_APP_ICON_SIZES } from '@/lib/support-push';

export const dynamic = 'force-dynamic';

const holder = globalThis as unknown as { __supportAppIcons?: Map<number, Buffer> };

/** The icon on a 100 × 100 grid: the bubble and its three dots within the middle 60 %. */
function iconSvg(bg: string, ink: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><path d="M28 30h44a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H48l-12 10v-10h-8a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z" fill="${ink}"/><circle cx="38" cy="49" r="4" fill="${bg}"/><circle cx="50" cy="49" r="4" fill="${bg}"/><circle cx="62" cy="49" r="4" fill="${bg}"/></svg>`;
}

export async function GET(_request: Request, ctx: { params: Promise<{ size: string }> }): Promise<Response> {
  const size = Number((await ctx.params).size);
  if (!(SUPPORT_APP_ICON_SIZES as readonly number[]).includes(size)) return new Response('not found', { status: 404 });
  const cache = (holder.__supportAppIcons ??= new Map());
  let png = cache.get(size);
  if (!png) {
    png = await sharp(Buffer.from(iconSvg(SUPPORT_APP_COLOURS.background, SUPPORT_APP_COLOURS.ink)), { density: Math.ceil((72 * size) / 100) })
      .resize(size, size)
      .png()
      .toBuffer();
    cache.set(size, png);
  }
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
}
