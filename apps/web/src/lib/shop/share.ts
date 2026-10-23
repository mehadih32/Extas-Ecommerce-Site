// PR 69 — the share row's tiles (demo 30-product.js pdp_shareRow): each network's own share address for the page, in
// the owner's order, built at the moment of the tap from the page's real address. Instagram has no share address on
// the web, so its tile hands the link to the phone's own share sheet (or copies it, with a word on where to paste it);
// Messenger's link opens the app, so it is a phone tile.
export const SHARE_TILES = ['facebook', 'messenger', 'whatsapp', 'instagram', 'copy'] as const;
export type ShareTile = (typeof SHARE_TILES)[number];

export type ShareAction = { kind: 'link'; href: string } | { kind: 'copy' } | { kind: 'native' };

/** What a tile does for the page at `url`, with `text` as the message where the network takes one. */
export function shareAction(tile: ShareTile, url: string, text: string): ShareAction {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  switch (tile) {
    case 'facebook':
      return { kind: 'link', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` };
    case 'messenger':
      return { kind: 'link', href: `fb-messenger://share/?link=${u}` };
    case 'whatsapp':
      return { kind: 'link', href: `https://wa.me/?text=${t}%20${u}` };
    case 'instagram':
      return { kind: 'native' };
    case 'copy':
      return { kind: 'copy' };
  }
}

/** Tiles that only make sense on a phone (an app link). */
export const PHONE_ONLY: ReadonlySet<ShareTile> = new Set(['messenger']);
