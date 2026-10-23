'use client';
// PR 6 (follow-up 84), PR 12 — SH-05, the guide side panel "এই সেকশনে কী করা যায়": the section's Bengali guide from
// docs/admin-guide/ (GET /api/admin/help/<slug>, read from the server's deployed copy of the docs), drawn from the
// parsed blocks — never as HTML. A link to another guide opens it here; a web link opens in a new tab.
import { Fragment, useEffect, useState } from 'react';
import type { Block, Guide, Inline } from '@/lib/admin-shell/guide';
import { t, type Dict } from '@/lib/i18n';
import { Drawer } from './Drawer';
import type { GuideRequest } from './events';

function Inlines({ c, onGuide }: { c: Inline[]; onGuide(slug: string): void }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === 'text') return <Fragment key={i}>{x.v}</Fragment>;
        if (x.t === 'code') return <code key={i}>{x.v}</code>;
        if (x.t === 'b') return <b key={i}><Inlines c={x.c} onGuide={onGuide} /></b>;
        if (x.t === 'a')
          return (
            <a key={i} className="a2-lnk" href={x.href} target="_blank" rel="noopener noreferrer">
              <Inlines c={x.c} onGuide={onGuide} />
            </a>
          );
        return (
          <a
            key={i}
            href={`/admin/help#${x.slug}`}
            onClick={(e) => {
              e.preventDefault();
              onGuide(x.slug);
            }}
          >
            <Inlines c={x.c} onGuide={onGuide} />
          </a>
        );
      })}
    </>
  );
}

function Blocks({ blocks, onGuide }: { blocks: Block[]; onGuide(slug: string): void }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return b.level <= 2 ? <h3 key={i}><Inlines c={b.c} onGuide={onGuide} /></h3> : <h4 key={i}><Inlines c={b.c} onGuide={onGuide} /></h4>;
          case 'p':
            return <p key={i}><Inlines c={b.c} onGuide={onGuide} /></p>;
          case 'pre':
            return <pre key={i}>{b.v}</pre>;
          case 'hr':
            return <hr key={i} className="a2-hr" />;
          case 'table':
            return (
              <div key={i} className="a2-gtbl">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}><Inlines c={c} onGuide={onGuide} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}><Inlines c={c} onGuide={onGuide} /></td>
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
                    <Inlines c={it.c} onGuide={onGuide} />
                    {it.sub.length ? <Blocks blocks={it.sub} onGuide={onGuide} /> : null}
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

export function GuidePanel({ dict, request, onOpen, onClose }: { dict: Dict; request: GuideRequest; onOpen(r: GuideRequest): void; onClose(): void }) {
  const tt = (k: string, vars?: Record<string, string>) => t(dict, `shell.guide.${k}`, vars);
  const [state, setState] = useState<{ slug: string; guide: Guide | null; failed: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/help/${encodeURIComponent(request.slug)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { guide?: Guide };
        if (live) setState({ slug: request.slug, guide: r.ok && j.guide ? j.guide : null, failed: !r.ok || !j.guide });
      })
      .catch(() => live && setState({ slug: request.slug, guide: null, failed: true }));
    return () => {
      live = false;
    };
  }, [request.slug]);
  const ready = state && state.slug === request.slug ? state : null;
  return (
    <Drawer title={tt('title', { section: request.section })} sub={ready?.guide?.title} closeLabel={tt('close')} onClose={onClose} testId="ag-panel" wide>
      <div className="a2-guidebody" lang="bn">
        {!ready ? <p className="a2-mute">{tt('loading')}</p> : ready.guide ? <Blocks blocks={ready.guide.blocks} onGuide={(slug) => onOpen({ slug, section: request.section })} /> : <p className="a2-mute" role="alert">{tt('error')}</p>}
      </div>
    </Drawer>
  );
}
