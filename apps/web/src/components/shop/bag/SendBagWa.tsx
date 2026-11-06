'use client';
// S02 · PR 80 follow-up 679 (demo 50-bag.js ACT['bag-wa'], Blueprint D4.1 `bag.waSendBag`, off as shipped) — "Send my bag
// on WhatsApp" under the bag's Checkout button: a popup shows the message (the bag, written on the server from the
// shop's words) and "Open WhatsApp and send" opens WhatsApp with it to the store's own number (`contact.whatsapp`).
// Nothing is sent by the shop: the customer sends it himself. Drawn only with the switch on and a number set.
import { useRef, useState } from 'react';
import { WaGlyph } from '../Icon';
import { PdpModal } from '../product/PdpModal';

export interface SendBagWaWords {
  button: string;
  title: string;
  intro: string;
  open: string;
  back: string;
  close: string;
}

export function SendBagWa({ href, message, words }: { href: string; message: string; words: SendBagWaWords }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" className="btn btn-ghost btn-block mt8" onClick={() => setOpen(true)} data-testid="bag-wa-send">
        <WaGlyph size={18} />
        {words.button}
      </button>
      {open ? (
        <PdpModal title={words.title} closeLabel={words.close} onClose={() => setOpen(false)} opener={opener} testId="bag-wa-dialog">
          <p className="small text2 bg-wa-intro">{words.intro}</p>
          <div className="bg-wa" data-testid="wa-preview">
            {message}
          </div>
          <a className="btn btn-primary btn-block mt16" href={href} target="_blank" rel="noopener" data-testid="bag-wa-open">
            <WaGlyph size={19} />
            {words.open}
          </a>
          <button type="button" className="btn btn-ghost btn-block mt8" onClick={() => setOpen(false)}>
            {words.back}
          </button>
        </PdpModal>
      ) : null}
    </>
  );
}
