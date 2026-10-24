// S14 · PR 291 — the Channels & limits form: taka typed, paisa kept; an empty box is "not set"; only changes are sent;
// the sender an SMS would go from.
import { describe, expect, it } from 'vitest';
import type { ChannelsConfig } from '@extas/messages';
import { channelsChanges, channelsDraft, draftSender } from './channels-draft';

const config: ChannelsConfig = {
  enabled: true,
  caps: { SMS: 2, WHATSAPP: 1, EMAIL: null, total: null },
  quietHours: { on: false, fromHour: 22, toHour: 8 },
  masking: null,
  smsRates: null,
};

describe('PR 291 · the Channels & limits form', () => {
  it('reads the settings into boxes and sends nothing when nothing changed', () => {
    const d = channelsDraft(config);
    expect(d).toMatchObject({ enabled: true, maskName: '', maskState: 'none', maskUse: true, rateMasked: '', caps: { SMS: '2', EMAIL: '' }, quietFrom: '22' });
    expect(channelsChanges(d, config)).toEqual({});
    expect(draftSender(d)).toBeNull();
  });

  it('money in taka becomes paisa; empty boxes are null; only the changed parts go', () => {
    const d = { ...channelsDraft(config), rateMasked: '0.6', rateNonMasked: '0.35', caps: { SMS: '3', WHATSAPP: '1', EMAIL: '', total: '' } };
    expect(channelsChanges(d, config)).toEqual({ smsRates: { maskedMinor: 60, nonMaskedMinor: 35 }, caps: { SMS: 3, WHATSAPP: 1, EMAIL: null, total: null } });
    const half = { ...channelsDraft(config), rateNonMasked: '0.35' };
    expect(channelsChanges(half, config)).toEqual({ smsRates: { maskedMinor: null, nonMaskedMinor: 35 } });
  });

  it('the sender name: sent with its state; used only once approved and wanted', () => {
    const d = { ...channelsDraft(config), maskName: ' SHOPNAME ', maskState: 'requested' as const };
    expect(channelsChanges(d, config)).toEqual({ masking: { senderName: 'SHOPNAME', state: 'requested', useWhenApproved: true } });
    expect(draftSender(d)).toBeNull();
    expect(draftSender({ ...d, maskState: 'approved' })).toBe('SHOPNAME');
    expect(draftSender({ ...d, maskState: 'approved', maskUse: false })).toBeNull();
    const back = channelsDraft({ ...config, masking: { senderName: 'SHOPNAME', state: 'approved', useWhenApproved: true } });
    expect(channelsChanges({ ...back, maskName: '', maskState: 'none' }, { ...config, masking: { senderName: 'SHOPNAME', state: 'approved', useWhenApproved: true } })).toEqual({ masking: null });
  });

  it('the master switch and the quiet hours', () => {
    expect(channelsChanges({ ...channelsDraft(config), enabled: false, quietOn: true }, config)).toEqual({ enabled: false, quietHours: { on: true, fromHour: 22, toHour: 8 } });
  });
});
