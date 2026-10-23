// The product page's words with their **bold** parts drawn bold (the dictionary marks them, so each language puts the
// stress where its own word order needs it). No hooks: server and client parts both use it.
import { Fragment } from 'react';
import { boldParts } from '@/lib/shop/product-model';

/** Words with their **bold** parts drawn bold. */
export function Bold({ text, cls }: { text: string; cls?: string }) {
  return (
    <>
      {boldParts(text).map((p, i) =>
        p.b ? (
          <b key={i} className={cls}>
            {p.text}
          </b>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
