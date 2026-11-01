// S21 · PR 594 — a docs file or a register cell drawn from its parsed Markdown blocks (lib/admin-shell/guide.ts
// parseMarkdown), never as HTML, in the same look as the guides (a2-gtbl tables, a2-gbox boxes). Links to other docs
// stay plain words; a web link opens in a new tab. `mark` highlights a searched word (letter case ignored). A box whose
// label is empty draws without one (a docs file's plain quote is not an "Example").
import { Fragment, type ReactNode } from 'react';
import type { Block, BoxKind, Inline } from '@/lib/admin-shell/guide';

function marked(text: string, mark: string): ReactNode {
  const q = mark.trim().toLowerCase();
  if (q.length < 2) return text;
  const out: ReactNode[] = [];
  const low = text.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, i + q.length)) {
    if (i > at) out.push(text.slice(at, i));
    out.push(<mark key={i}>{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  if (!out.length) return text;
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function DocInlines({ c, mark = '' }: { c: Inline[]; mark?: string }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === 'text') return <Fragment key={i}>{marked(x.v, mark)}</Fragment>;
        if (x.t === 'code') return <code key={i}>{marked(x.v, mark)}</code>;
        const inner = <DocInlines c={x.c} mark={mark} />;
        if (x.t === 'b') return <b key={i}>{inner}</b>;
        if (x.t === 's') return <s key={i}>{inner}</s>;
        if (x.t === 'a')
          return (
            <a key={i} className="a2-lnk" href={x.href} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          );
        return <Fragment key={i}>{inner}</Fragment>;
      })}
    </>
  );
}

export function DocBlocks({ blocks, boxes, mark = '' }: { blocks: Block[]; boxes: Record<BoxKind, string>; mark?: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const H = b.level <= 2 ? 'h3' : 'h4';
            return (
              <H key={i}>
                <DocInlines c={b.c} mark={mark} />
              </H>
            );
          }
          case 'p':
            return (
              <p key={i}>
                <DocInlines c={b.c} mark={mark} />
              </p>
            );
          case 'pre':
            return <pre key={i}>{marked(b.v, mark)}</pre>;
          case 'hr':
            return <hr key={i} className="a2-hr" />;
          case 'box':
            return (
              <div key={i} className={`a2-gbox ${b.kind}`} role="note">
                {boxes[b.kind] ? <b className="a2-gbox-t">{boxes[b.kind]}</b> : null}
                <DocBlocks blocks={b.blocks} boxes={boxes} mark={mark} />
              </div>
            );
          case 'table':
            return (
              <div key={i} className="a2-gtbl">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>
                          <DocInlines c={c} mark={mark} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>
                            <DocInlines c={c} mark={mark} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default: {
            const List = b.t;
            return (
              <List key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <DocInlines c={it.c} mark={mark} />
                    {it.sub.length ? <DocBlocks blocks={it.sub} boxes={boxes} mark={mark} /> : null}
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </>
  );
}
