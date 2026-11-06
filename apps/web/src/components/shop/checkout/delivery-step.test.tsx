// Follow-up 679 (PR 80) — the door note under the settled area (demo `.co-door`): only the owner's own words, only once
// the area is settled, and nothing at all while the note is off or empty. Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BandOut, DeliveryCharge, DeliveryView } from '@extas/checkout/pure';
import { DeliveryStep, type DeliveryStepProps } from './DeliveryStep';

const band: BandOut = { id: 'b1', key: 'dhaka-city', nameEn: 'Dhaka City', nameBn: null, role: 'city', priced: true, chargeMinor: 6000, hoursMin: 24, hoursMax: 48 };
const found: DeliveryView = { state: 'found', band, place: null, via: 'choice', placeSure: true };
const none: DeliveryView = { state: 'none' };
const charge: DeliveryCharge = { state: 'charge', chargeMinor: 6000 };
const free: DeliveryCharge = { state: 'free', reason: 'FREE_CAMPAIGN', freeOverMinor: null };
const NOTE = 'Sample words for the door'; // hardcode-ok: made-up test text

function html(p: Partial<DeliveryStepProps>): string {
  const base: DeliveryStepProps = {
    delivery: found,
    charge,
    rates: [band],
    freeGapMinor: null,
    reading: false,
    hasAddress: true,
    lang: 'en',
    w: (k) => k,
    m: (x) => String(x),
    n: (x) => String(x),
    onPick: () => {},
    onChange: () => {},
  };
  return renderToStaticMarkup(<DeliveryStep {...base} {...p} />);
}

describe('the door note (follow-up 679)', () => {
  it('shows the owner words under a settled area, charged or free', () => {
    expect(html({ doorNote: NOTE })).toContain('data-testid="co-door"');
    expect(html({ doorNote: NOTE })).toContain(NOTE);
    expect(html({ doorNote: NOTE, charge: free })).toContain(NOTE);
  });

  it('shows nothing while off, empty, still reading or before the area is settled', () => {
    expect(html({})).not.toContain('co-door');
    expect(html({ doorNote: null })).not.toContain('co-door');
    expect(html({ doorNote: NOTE, reading: true })).not.toContain(NOTE);
    expect(html({ doorNote: NOTE, delivery: none, charge: { state: 'unknown' } })).not.toContain(NOTE);
  });
});
