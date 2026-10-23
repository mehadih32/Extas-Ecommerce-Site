// PR 69 — the share tiles build each network's address from the page's real address, encoded.
import { shopMoreSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { PHONE_ONLY, SHARE_TILES, shareAction } from './share';

const url = 'https://new.example.test/p/essential-pique-polo?c=navy&x=1';

describe('share tiles', () => {
  it('Facebook, Messenger and WhatsApp carry the encoded address (and WhatsApp the message)', () => {
    expect(shareAction('facebook', url, 'x')).toEqual({ kind: 'link', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` });
    expect(shareAction('messenger', url, 'x')).toEqual({ kind: 'link', href: `fb-messenger://share/?link=${encodeURIComponent(url)}` });
    const wa = shareAction('whatsapp', url, 'Polo — Shop & co');
    expect(wa.kind === 'link' && wa.href).toBe(`https://wa.me/?text=Polo%20%E2%80%94%20Shop%20%26%20co%20${encodeURIComponent(url)}`);
  });

  it('Instagram uses the phone share sheet, Copy copies; Messenger is a phone tile', () => {
    expect(shareAction('instagram', url, 'x')).toEqual({ kind: 'native' });
    expect(shareAction('copy', url, 'x')).toEqual({ kind: 'copy' });
    expect(PHONE_ONLY.has('messenger')).toBe(true);
  });

  it('the setting names every tile once, in the demo order, closing after 8 s', () => {
    const s = shopMoreSettings['pdp.share'].default;
    expect(s.tiles.map((x) => x.id)).toEqual([...SHARE_TILES]);
    expect(s.tiles.every((x) => x.on)).toBe(true);
    expect(s.closeMs).toBe(8000);
    expect(shopMoreSettings['pdp.icons'].default.share).toBe(false);
  });
});
