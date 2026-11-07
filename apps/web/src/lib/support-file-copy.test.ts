// Follow-up 505 (PR 425, 426; B4.8): the app's wiring of the channel file copy — a channel on the practice mock gives
// the mock's sample picture, a live WhatsApp connection reads with its own token (none: nothing is read), a live
// Messenger Page reads the offered link; a copied file keeps its type only from the short safe list.
import { describe, expect, it } from 'vitest';
import { MOCK_CHANNEL_FILE } from '@extas/adapters';
import { fetcherFor, safeFileType } from './support-file-copy';

const conns = (mode: 'MOCK' | 'LIVE', token: string | null) => ({
  use: (async () => ({ mode, api: {}, integrationId: null, provider: 'x', storeId: null })) as never,
  secretOf: (async () => (token ? { value: token, integrationId: 'i', provider: 'x', mode, storeId: 1 } : null)) as never,
});

describe('support file copy wiring (follow-up 505)', () => {
  it('keeps a file`s type only from the safe list', () => {
    expect(safeFileType('image/JPEG; charset=binary')).toEqual({ contentType: 'image/jpeg', extension: 'jpg' });
    expect(safeFileType('audio/ogg')).toEqual({ contentType: 'audio/ogg', extension: 'ogg' });
    for (const t of ['text/html', 'image/svg+xml', 'application/javascript', ''])
      expect(safeFileType(t)).toEqual({ contentType: 'application/octet-stream', extension: 'bin' });
  });

  it('the practice mock gives the sample picture; a live WhatsApp needs its token; the live chat has no channel files', async () => {
    const mock = await fetcherFor(conns('MOCK', null), 1, 'whatsapp');
    expect((await mock!.fetch({ sourceUrl: 'https://graph.facebook.com/v21.0/1' }, { maxBytes: 1_000, timeoutMs: 1_000, maxRedirects: 0 })).body).toEqual(MOCK_CHANNEL_FILE);
    expect(await fetcherFor(conns('MOCK', null), 1, 'messenger')).not.toBeNull();
    expect(await fetcherFor(conns('LIVE', null), 1, 'whatsapp')).toBeNull();
    expect(await fetcherFor(conns('LIVE', 'sample-token'), 1, 'whatsapp')).not.toBeNull();
    expect(await fetcherFor(conns('LIVE', null), 1, 'messenger')).not.toBeNull();
    expect(await fetcherFor(conns('LIVE', 'sample-token'), 1, 'livechat')).toBeNull();
  });
});
