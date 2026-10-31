// CN-020 (4) · SIM-F-047 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the voice address — off as
// shipped, the phone's words kept as they came, a recording read by the server's speech connection (or by nobody: the
// team listens), the recording kept only by the owner's switch, a browser's hourly limit; the order placed with it is
// marked VOICE_ENTERED, an unsure reading VOICE_CALL with a call task, and one recording goes into one order only.
// Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry } from '@extas/settings';
import { placeOrder, type PlaceInput } from './place';
import { checkoutQuote } from './quote';
import { setUpCheckout, type CheckoutFixture } from './testing';
import { saveVoiceAddress, type VoiceHooks } from './voice';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const FORM = { name: 'Test Customer', phone: '01700000147', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };
const AUDIO = { body: new Uint8Array([26, 69, 223, 163, 1, 2, 3, 4]), contentType: 'audio/webm;codecs=opus' };

describe.skipIf(!HAS_TEST_DB)('CN-020 (4) · the voice address (PostgreSQL)', () => {
  let f: CheckoutFixture;
  const kept: { storeId: number; bytes: number; type: string }[] = [];
  let heard: { text: string | null; confidence: number | null } | Error = { text: 'বাড়ি ৪, রোড ৫, ধানমন্ডি', confidence: 0.9 };
  const hooks: VoiceHooks = {
    async keep(storeId, body, contentType) {
      kept.push({ storeId, bytes: body.byteLength, type: contentType });
      return randomUUID();
    },
    async transcribe() {
      if (heard instanceof Error) throw heard;
      return heard;
    },
  };
  const on = (extra: Record<string, unknown> = {}) => f.overrides.set('checkout.voice', { ...registry['checkout.voice'].default, enabled: true, ...extra });
  const save = (visitorId: string, more: Record<string, unknown> = {}) => saveVoiceAddress(f.deps(), hooks, { storeId: f.S, visitorId, ...more });

  beforeAll(async () => {
    f = await setUpCheckout('voice');
    await f.priceBand('dhaka-city', 8_000);
    f.overrides.set('payment.cod.enabled', true);
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  async function placeWith(name: string, voice: { id: string } | null) {
    const bag = await f.bag(name, [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }]);
    const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: null, address: { line: FORM.address, confirmed: null }, payment: null, details: { name: FORM.name, phone: FORM.phone } });
    const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form: FORM, confirmed: null, payment: null, fingerprint: q.fingerprint, voice };
    return { bag, place: (visitorId = bag.visitorId) => placeOrder(f.deps(), { storeId: f.S, visitorId, customerId: null, ip: '192.0.2.147', input }) };
  }

  it('is off as shipped: nothing saved', async () => {
    expect(registry['checkout.voice'].default.enabled).toBe(false);
    expect(await code(save('visitor-voice-0001', { transcript: 'House 4' }))).toBe('NOT_OPEN');
    expect(await f.t.prisma.checkoutVoice.count()).toBe(0);
  });

  it("the phone's words are kept as they came; a recording without words is read on the server; nothing heard is unsure", async () => {
    on();
    const phone = await save('visitor-voice-0002', { transcript: 'House 4, Road 5', confidence: 0.82, audio: AUDIO, durationMs: 4200 });
    expect(phone).toMatchObject({ transcript: 'House 4, Road 5', confidence: 0.82, engine: 'BROWSER', low: false, kept: true });
    expect(kept.at(-1)).toEqual({ storeId: f.S, bytes: AUDIO.body.byteLength, type: 'audio/webm' });
    const server = await save('visitor-voice-0002', { audio: AUDIO });
    expect(server).toMatchObject({ transcript: 'বাড়ি ৪, রোড ৫, ধানমন্ডি', confidence: 0.9, engine: 'SERVER', low: false });
    heard = { text: null, confidence: null }; // the mock: nothing heard
    expect(await save('visitor-voice-0002', { audio: AUDIO })).toMatchObject({ transcript: null, engine: 'SERVER', low: true, kept: true });
    heard = new Error('the speech service did not answer');
    expect(await save('visitor-voice-0002', { audio: AUDIO })).toMatchObject({ transcript: null, engine: 'NONE', low: true, kept: true });
    // below the owner's line: unsure; the recording not kept when the switch is off
    on({ minConfidence: 0.9, keepRecording: false });
    const before = kept.length;
    expect(await save('visitor-voice-0003', { transcript: 'Road 5', confidence: 0.5, audio: AUDIO })).toMatchObject({ low: true, kept: false });
    expect(kept.length).toBe(before);
    const row = await f.t.prisma.checkoutVoice.findFirstOrThrow({ where: { visitorId: 'visitor-voice-0002', engine: 'BROWSER' } });
    expect(row).toMatchObject({ storeId: f.S, lang: 'bn-BD', durationMs: 4200, orderId: null });
  });

  it('checks what it is given: empty, too long, the wrong kind, too many in an hour', async () => {
    on({ maxKb: 64, maxPerHour: 2 });
    expect(await code(save('visitor-voice-0004', {}))).toBe('INVALID_INPUT');
    expect(await code(save('visitor-voice-0004', { audio: { body: new Uint8Array(65 * 1024), contentType: 'audio/webm' } }))).toBe('INVALID_INPUT');
    expect(await code(save('visitor-voice-0004', { audio: { body: new Uint8Array([1]), contentType: 'text/html' } }))).toBe('INVALID_INPUT');
    expect(await code(save('visitor-voice-0004', { transcript: 'x', confidence: 2 }))).toBe('INVALID_INPUT');
    await save('visitor-voice-0004', { transcript: 'House 4' });
    await save('visitor-voice-0004', { transcript: 'House 4' });
    expect(await code(save('visitor-voice-0004', { transcript: 'House 4' }))).toBe('TOO_MANY');
    f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
    expect(await code(save('visitor-voice-0004', { transcript: 'House 4' }))).toBe('ok');
  });

  it('the order is marked voice-entered; an unsure reading asks for a call; one recording, one order', async () => {
    on();
    const sure = await placeWith('voice-sure', null);
    const v1 = await save(sure.bag.visitorId, { transcript: 'House 4, Road 5, Dhanmondi', confidence: 0.95 });
    const a = await placeWith('voice-sure-2', { id: v1.id });
    // someone else's recording is not his: the order is placed as typed
    const o0 = await a.place();
    expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: o0.orderId } })).flags).not.toContain('VOICE_ENTERED');
    const own = await placeWith('voice-own', null);
    const v2 = await save(own.bag.visitorId, { transcript: 'House 4, Road 5, Dhanmondi', confidence: 0.95 });
    const placedOwn = await (await placeWithBag(own.bag, { id: v2.id }))();
    const o1 = await f.t.prisma.order.findUniqueOrThrow({ where: { id: placedOwn.orderId }, include: { events: true } });
    expect(o1.flags).toContain('VOICE_ENTERED');
    expect(o1.flags).not.toContain('VOICE_CALL');
    expect(o1.events.find((e) => e.type === 'order.placed')?.data).toMatchObject({ voice: { engine: 'BROWSER', low: false } });
    expect((await f.t.prisma.checkoutVoice.findUniqueOrThrow({ where: { id: v2.id } })).orderId).toBe(o1.id);

    const unsure = await placeWith('voice-unsure', null);
    const v3 = await save(unsure.bag.visitorId, { audio: AUDIO });
    expect(v3.low).toBe(true);
    const placed = await (await placeWithBag(unsure.bag, { id: v3.id }))();
    const o2 = await f.t.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(o2.flags).toEqual(expect.arrayContaining(['VOICE_ENTERED', 'VOICE_CALL']));
    expect(await f.t.prisma.callTask.count({ where: { orderId: o2.id, reason: 'VOICE_CALL' } })).toBe(1);
    // switched off meanwhile: the order is placed as typed, the recording stays unlinked
    const later = await placeWith('voice-off', null);
    const v4 = await save(later.bag.visitorId, { transcript: 'Road 5', confidence: 0.9 });
    f.overrides.set('checkout.voice', registry['checkout.voice'].default);
    const p4 = await (await placeWithBag(later.bag, { id: v4.id }))();
    expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: p4.orderId } })).flags).not.toContain('VOICE_ENTERED');
    expect((await f.t.prisma.checkoutVoice.findUniqueOrThrow({ where: { id: v4.id } })).orderId).toBeNull();
  });

  /** Places the order of a bag already made (his own recording with it). */
  async function placeWithBag(bag: { cartId: string; visitorId: string }, voice: { id: string }) {
    const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: null, address: { line: FORM.address, confirmed: null }, payment: null, details: { name: FORM.name, phone: FORM.phone } });
    const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form: FORM, confirmed: null, payment: null, fingerprint: q.fingerprint, voice };
    return () => placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: null, ip: '192.0.2.147', input });
  }
});
