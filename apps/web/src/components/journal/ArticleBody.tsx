// S12 · PR 240, 241 — an article's blocks drawn as HTML (lib/journal/blocks.ts): the editor's preview and the shop's
// article page use this one component, so the writer sees what the reader gets. The product block is a slot: the shop
// passes the product cards, the preview a placeholder. No state, so it runs on the server and in the editor alike.
import { Fragment, type ReactNode } from 'react';
import { blocks, type Inline } from '@/lib/journal/blocks';

function Line({ s }: { s: Inline[] }) {
  return (
    <>
      {s.map((x, i) =>
        x.t === 'b' ? (
          <strong key={i}>{x.s}</strong>
        ) : x.t === 'a' ? (
          <a key={i} href={x.href} rel={x.href.startsWith('/') ? undefined : 'noopener'}>
            {x.s}
          </a>
        ) : (
          // plain text nodes (no wrapper), so a link inside a sentence is an inline link to the reader and the device gate
          <Fragment key={i}>{x.s}</Fragment>
        ),
      )}
    </>
  );
}

export function ArticleBody({ body, products, boxWords }: { body: string; products?: ReactNode; boxWords: { tip: string; note: string } }) {
  return (
    <div className="jr-body">
      {blocks(body).map((b, i) => {
        switch (b.t) {
          case 'h2':
            return (
              <h2 key={i} id={b.id}>
                {b.s}
              </h2>
            );
          case 'h3':
            return <h3 key={i}>{b.s}</h3>;
          case 'p':
            return (
              <p key={i}>
                <Line s={b.s} />
              </p>
            );
          case 'ul':
          case 'ol': {
            const L = b.t;
            return (
              <L key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Line s={it} />
                  </li>
                ))}
              </L>
            );
          }
          case 'box':
            return (
              <aside key={i} className={`jr-box jr-box-${b.k}`}>
                <b>{boxWords[b.k]}</b> <Line s={b.s} />
              </aside>
            );
          case 'products':
            return products ? <div key={i}>{products}</div> : null;
        }
      })}
    </div>
  );
}
