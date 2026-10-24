'use client';
// S06 · PR 542 — the advance pay link's page (`/pay/<token>`), opened from the SMS or WhatsApp a person sent from the
// order. It looks like the checkout's payment page (PR 125) and works the same way: with a real gateway connected "Pay"
// opens the gateway's own page; until then the test page (A1.3) says plainly that no money is taken, and its two buttons
// stand for the gateway's two answers — only while the owner's test payments are on (follow-up 50). A failure is kept
// and "Try again" makes a new try of the same link. Once paid it says so; a link whose order no longer waits says that.
import '../bag/bag.css';
import './checkout.css';
import { useState } from 'react';
import { fill } from '@/lib/shop/dict';
import { Icon } from '../Icon';
import { showToast } from '../toast';
import { postJson } from './quote-client';

export const PAY_LINK_URL = '/api/pay/link';

export interface LinkPayPageProps {
  token: string;
  number: string;
  /** The advance, already in the page's money format. */
  amount: string;
  method: string;
  state: 'open' | 'failed' | 'paid' | 'closed';
  test: boolean;
  gateway: boolean;
  lang: string;
  words: Record<string, string>;
  home: string;
}

export function LinkPayPage({ token, number, amount, method, state, test, gateway, lang, words, home }: LinkPayPageProps) {
  const [busy, setBusy] = useState(false);
  const w = (k: string, vars: Record<string, string | number> = {}) => fill(words[k] ?? k, vars);
  const act = async (action: 'approve' | 'fail' | 'retry' | 'start', el: HTMLElement) => {
    if (busy) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; next?: string; error?: string }>(PAY_LINK_URL, { token, action, lang });
    if (r.data?.ok && r.data.next) {
      window.location.assign(r.data.next);
      if (r.data.next === window.location.pathname) window.location.reload();
      return;
    }
    setBusy(false);
    showToast(el, w(!r.data ? 'err.network' : r.data.error === 'TEST_PAYMENTS_OFF' ? 'unavailable' : r.data.error === 'ORDER_CLOSED' ? 'closed' : 'err.other'));
  };
  return (
    <div className="container co-wrap co-paypage" data-testid="pl-page">
      <div className="card p20 co-paycard">
        <h1 className="h1">{w('title')}</h1>
        <p className="text2 mt8" data-testid="pl-number">
          {w('order', { number })}
        </p>
        <div className="co-payamt mt16">
          <span className="text2">{w('amount')}</span>
          <b className="price" data-testid="pl-amount">
            {amount}
          </b>
          {method ? <span className="small text2">{w('with', { method })}</span> : null}
        </div>
        {state === 'open' || state === 'failed' ? <p className="small text2 mt12">{w('why')}</p> : null}
        {state === 'open' && gateway ? (
          <p className="text2 mt16" data-testid="pl-redirect">
            {w('redirect', { method: method || w('online') })}
          </p>
        ) : state === 'open' && test ? (
          <p className="co-paytest mt16" data-testid="pl-test">
            <Icon name="info" size={15} />
            <span>{w('test')}</span>
          </p>
        ) : null}
        {state === 'failed' ? (
          <p className="co-payfail mt12" role="alert" data-testid="pl-failed">
            <Icon name="info" size={15} />
            <span>{w('failed')}</span>
          </p>
        ) : null}
        <div className="stack s12 mt16">
          {state === 'paid' ? (
            <p className="co-paytest" role="status" data-testid="pl-paid">
              <Icon name="check" size={15} />
              <span>{w('paid')}</span>
            </p>
          ) : state === 'closed' ? (
            <p className="text2" data-testid="pl-closed">
              {w('closed')}
            </p>
          ) : state === 'failed' ? (
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={(e) => void act('retry', e.currentTarget)} data-testid="pl-retry">
              {busy ? w('wait') : w('retry')}
            </button>
          ) : gateway ? (
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={(e) => void act('start', e.currentTarget)} data-testid="pl-start">
              <Icon name="lock" size={18} />
              {busy ? w('wait') : w('approve', { amount })}
            </button>
          ) : !test ? (
            <p className="co-payfail" role="status" data-testid="pl-unavailable">
              <Icon name="info" size={15} />
              <span>{w('unavailable')}</span>
            </p>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={(e) => void act('approve', e.currentTarget)} data-testid="pl-approve">
                <Icon name="lock" size={18} />
                {busy ? w('wait') : w('approve', { amount })}
              </button>
              <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={(e) => void act('fail', e.currentTarget)} data-testid="pl-fail">
                {w('fail')}
              </button>
            </>
          )}
          <a className="link center co-payback" href={home} data-testid="pl-home">
            {w('home')}
          </a>
        </div>
      </div>
    </div>
  );
}

/** The page for a link that does not exist (or cannot be read now). */
export function LinkPayNotFound({ words, home }: { words: Record<string, string>; home: string }) {
  return (
    <div className="container co-wrap co-paypage" data-testid="pl-notfound">
      <div className="card p20 co-paycard">
        <h1 className="h1">{words.title ?? 'paylink.title'}</h1>
        <p className="text2 mt8">{words.notFound ?? 'paylink.notFound'}</p>
        <a className="btn btn-primary btn-block mt16" href={home}>
          {words.home ?? 'paylink.home'}
        </a>
      </div>
    </div>
  );
}
