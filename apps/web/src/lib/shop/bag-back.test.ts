// Follow-up 641 (PR 275, 276): a chat app's link preview robot opening a bag-back link is sent on to /bag without a bag
// being made or a code looked up; a person's browser (an app's own browser too) still gets the bag back.
import { describe, expect, it } from 'vitest';
import { bagBackHandler, isLinkRobot, type BagApiDeps } from './bag-api';

const PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

describe('follow-up 641: the bag-back link and link preview robots', () => {
  it('tells a preview robot from a person', () => {
    for (const ua of ['WhatsApp/2.24.20.89 A', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'TelegramBot (like TwitterBot)', 'Slackbot-LinkExpanding 1.0', '', null]) {
      expect(isLinkRobot(ua), String(ua)).toBe(true);
    }
    for (const ua of [PHONE, `${PHONE} [FBAN/FB4A;FBAV/480.0]`, `${PHONE} Instagram 350.0`, `${PHONE} WhatsApp/2.24`]) expect(isLinkRobot(ua), ua).toBe(false);
  });

  it('a robot is sent on to the bag with nothing looked up; a person`s visit looks the code up', async () => {
    const looked: string[] = [];
    const deps = {
      storeId: 1,
      cart: { db: { checkoutDraft: { findFirst: async () => (looked.push('draft'), null) }, cart: { findFirst: async () => (looked.push('cart'), null) } } },
    } as unknown as BagApiDeps;
    const open = (ua: string) => bagBackHandler(new Request('https://shop.example.test/api/bag/back/sample-code-1', { headers: { 'user-agent': ua } }), deps, 'sample-code-1');
    const robot = await open('WhatsApp/2.24.20.89 A');
    expect([robot.status, robot.headers.get('location'), robot.headers.get('set-cookie')]).toEqual([303, '/bn/bag', null]);
    expect(looked).toEqual([]);
    const person = await open(PHONE);
    expect(person.status).toBe(303);
    expect(looked).toEqual(['draft', 'cart']);
  });
});
