'use client';
// PR 135 — the welcome panel on the order page, the first time he comes from the thank-you page ("Track your order"):
// this is his account, made with this order (or the account it joined), and how he logs in — his mobile number and a
// code by SMS. Never a password (SIM-F-039): the demo's "Password: your phone number" is the finding it fixes.
// Closing it hides it and takes `?from=thanks` off the address, so a reload or a shared link does not bring it back.
import { useState } from 'react';
import { Icon } from '../Icon';

export interface WelcomeWords {
  title: string;
  text: string;
  loginWith: string;
  how: string;
  howText: string;
  close: string;
}

export function OrderWelcome({ words, phone }: { words: WelcomeWords; phone: string | null }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('from');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch {
      // the address stays as it is; the panel is closed either way
    }
  };
  return (
    <section className="card ord-welcome" data-testid="order-welcome" aria-labelledby="ordw-h">
      <div className="row between top" style={{ gap: 12 }}>
        <div className="row top" style={{ gap: 12 }}>
          <span className="ord-wic">
            <Icon name="user" size={20} />
          </span>
          <div>
            <h2 className="h3" id="ordw-h">
              {words.title}
            </h2>
            <p className="xs text2 ord-wtext">{words.text}</p>
          </div>
        </div>
        <button type="button" className="iconbtn shrink0" onClick={close} aria-label={words.close} data-testid="order-welcome-close">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="ord-cred">
        {phone ? (
          <div>
            <span className="xs muted">{words.loginWith}</span>
            <b>{phone}</b>
          </div>
        ) : null}
        <div>
          <span className="xs muted">{words.how}</span>
          <b>{words.howText}</b>
        </div>
      </div>
    </section>
  );
}
