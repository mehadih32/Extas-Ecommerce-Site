// PR 748 (follow-up) — "Send the money to" on the thank-you page: nothing when it is off or nothing is set, else the numbers.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SendTo } from './SendTo';

const words = {
  'ty.sendTitle': 'Send the money to',
  'ty.sendNote': 'Write your order number {number} as the reference.',
  'ty.sendWallet': '{provider} ({kind})',
  'ty.sendKind_merchant': 'merchant',
  'ty.sendBank': '{bank}, account name {account}',
  'ty.sendBankNo': 'Account number {no}',
  'ty.sendBankBranch': 'Branch {branch}',
  'pm.bkash': 'bKash',
};

describe('PR 748 · the receiving numbers on the thank-you page', () => {
  it('draws nothing while it is off or nothing is set', () => {
    expect(renderToStaticMarkup(<SendTo sendTo={null} words={words} number="EX-1" />)).toBe('');
    expect(renderToStaticMarkup(<SendTo sendTo={{ wallets: [], banks: [] }} words={words} number="EX-1" />)).toBe('');
  });
  it('lists the wallet numbers and bank accounts and says which order number to write', () => {
    const html = renderToStaticMarkup(<SendTo sendTo={{ wallets: [{ provider: 'bkash', number: '+8801711000000', kind: 'merchant' }], banks: [{ bankName: 'Sample Bank', accountName: 'Sample Shop', accountNumber: '1234567890', branch: 'Main' }] }} words={words} number="EX-1052" />);
    expect(html).toContain('+8801711000000');
    expect(html).toContain('bKash (merchant)');
    expect(html).toContain('Sample Bank, account name Sample Shop');
    expect(html).toContain('Account number 1234567890');
    expect(html).toContain('Branch Main');
    expect(html).toContain('Write your order number EX-1052 as the reference.');
  });
});
