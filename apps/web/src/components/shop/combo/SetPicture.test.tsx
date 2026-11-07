// PR 93 follow-up 171: the set picture is the owner's set photo (PR 575) when one is given, else the pieces side by side.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import type { ImageSource } from '@extas/media/delivery';
import { SetPicture, type SetPart } from './SetPicture';

const presets = registry['media.image.presets'].default;
const photo: ImageSource = {
  id: 'set',
  dominantColor: '#142050',
  altEn: null,
  altBn: null,
  ratio: registry['media.image.aspectRatio'].default,
  variants: presets.map((p) => ({ preset: p.name, format: 'jpeg' as const, width: p.width, height: (p.width * 5) / 4, url: `/media/s/${p.name}.jpeg` })),
  slots: registry['media.image.slots'].default,
  phoneMaxWidth: registry['media.image.phoneMaxWidth'].default,
};
const parts: SetPart[] = [
  { garment: 'polo', hex: '#142050', photo: null, name: 'Navy polo' },
  { garment: 'chino', hex: '#c3b091', photo: null, name: 'Khaki chino' },
];

describe('PR 93 follow-up 171 · the set picture', () => {
  it('shows the set photo alone when one is given', () => {
    const html = renderToStaticMarkup(<SetPicture parts={parts} lang="en" alt="Navy polo, Khaki chino" sizes="100vw" slot="main" photo={photo} />);
    expect(html).toContain('data-testid="cb-setphoto"');
    expect(html).toContain('/media/s/');
    expect(html).not.toContain('cb-part');
  });
  it('else the pieces side by side, as before', () => {
    const html = renderToStaticMarkup(<SetPicture parts={parts} lang="en" alt="Navy polo, Khaki chino" sizes="100vw" slot="main" />);
    expect(html).not.toContain('cb-setphoto');
    expect(html.match(/cb-part/g)).toHaveLength(2);
  });
});
