// PR 748 (follow-up) — "Send the money to": the wallet numbers and bank accounts of Settings › Checkout, drawn on the thank-you
// page of an order whose prepaid payment is still waiting, only while the owner has `checkout.pay.showNumbers` on. The words
// come from the shop dictionary (`checkout.ty.send*`); nothing is written in here.
import { fill } from '@/lib/shop/dict';

export interface SendToView {
  wallets: { provider: string; number: string; kind: 'merchant' | 'personal' | 'agent' }[];
  banks: { bankName: string; accountName: string; accountNumber: string; branch?: string | undefined; routingNumber?: string | undefined }[];
}

export function SendTo({ sendTo, words, number }: { sendTo: SendToView | null; words: Record<string, string>; number: string }) {
  if (!sendTo || (!sendTo.wallets.length && !sendTo.banks.length)) return null;
  const w = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  return (
    <div className="small mt12" data-testid="ty-send">
      <div className="h3">{w('ty.sendTitle')}</div>
      <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
        {sendTo.wallets.map((x) => (
          <li key={`${x.provider}-${x.number}`} data-testid="ty-send-wallet">
            <strong dir="ltr">{x.number}</strong> · {w('ty.sendWallet', { provider: words[`pm.${x.provider}`] ?? x.provider, kind: w(`ty.sendKind_${x.kind}`) })}
          </li>
        ))}
        {sendTo.banks.map((b) => (
          <li key={`${b.bankName}-${b.accountNumber}`} data-testid="ty-send-bank">
            {w('ty.sendBank', { bank: b.bankName, account: b.accountName })} · <strong dir="ltr">{w('ty.sendBankNo', { no: b.accountNumber })}</strong>
            {b.branch ? ` · ${w('ty.sendBankBranch', { branch: b.branch })}` : ''}
            {b.routingNumber ? ` · ${w('ty.sendBankRouting', { routing: b.routingNumber })}` : ''}
          </li>
        ))}
      </ul>
      <div className="xs muted" style={{ marginTop: 4 }}>
        {w('ty.sendNote', { number })}
      </div>
    </div>
  );
}
