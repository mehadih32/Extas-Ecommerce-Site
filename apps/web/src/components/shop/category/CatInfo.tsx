'use client';
// PR 45 — the text block and the questions under the grid (demo 21-category.js, the `cat-info` section): the owner's
// category text, clamped to a few lines with "Read more" (shown only when the text really runs past them), and the
// questions as an accordion (the first one open when the owner wants it). Every answer stays in the page for search
// engines; a closed one is only hidden.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';

export function CatSeoText({ paras, more, less }: { paras: string[]; more: string; less: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // a text that fits in the clamp needs no "Read more"
    const id = requestAnimationFrame(() => setLong(el.scrollHeight > el.clientHeight + 2));
    return () => cancelAnimationFrame(id);
  }, [paras]);
  return (
    <>
      <div ref={box} className={`cat-seo-txt${open || !long ? '' : ' clamp'}`} id="cat-seo-txt">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {long ? (
        <button type="button" className="link" aria-expanded={open} aria-controls="cat-seo-txt" onClick={() => setOpen((v) => !v)}>
          {open ? less : more}
        </button>
      ) : null}
    </>
  );
}

export function CatFaq({ items, openFirst }: { items: Array<{ id: string; q: string; a: string[] }>; openFirst: boolean }) {
  const [open, setOpen] = useState(openFirst ? 0 : -1);
  return (
    <div className="cat-faq">
      {items.map((f, i) => (
        <div className="cat-faq-item" key={f.id}>
          <button type="button" className="cat-faq-q" aria-expanded={open === i} aria-controls={`cat-faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
            {f.q}
            <Icon name={open === i ? 'minus' : 'plus'} size={18} />
          </button>
          <div className="cat-faq-a" id={`cat-faq-${i}`} hidden={open !== i}>
            {f.a.map((p, k) => (
              <p key={k}>{p}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
