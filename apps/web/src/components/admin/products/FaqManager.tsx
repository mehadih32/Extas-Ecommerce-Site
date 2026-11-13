'use client';
// S28 · PR 682 — Products › FAQs: the questions and answers that show on product pages. Three lists (the whole shop,
// a category, one product); add, edit, hide or show, archive. A category's questions reach every product of it by
// themselves. Nothing is deleted: Archive keeps the row, and "Bring back" is on the archived list. Changing needs
// `catalogue.write` (the API checks again); whether the shop shows them is the switch under More options.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { refusalText } from './model';
import { say, sayBad } from './useToast';
import './photo-manager.css';

export interface FaqItem {
  id: string;
  scope: 'PRODUCT' | 'CATEGORY' | 'SHOP';
  where: string;
  questionEn: string;
  questionBn: string | null;
  answerEn: string;
  answerBn: string | null;
  isActive: boolean;
  archived: boolean;
  fromQuestion: boolean;
}

export interface FaqManagerProps {
  dict: Dict;
  items: FaqItem[];
  products: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  canWrite: boolean;
  showArchived: boolean;
  archivedCount: number;
  archivedHref: string;
  liveHref: string;
}

type Draft = { id: string | null; scope: FaqItem['scope']; productId: string; categoryId: string; questionEn: string; answerEn: string; questionBn: string; answerBn: string };
const blank = (p: FaqManagerProps): Draft => ({
  id: null,
  scope: 'SHOP',
  productId: p.products[0]?.id ?? '',
  categoryId: p.categories[0]?.id ?? '',
  questionEn: '',
  answerEn: '',
  questionBn: '',
  answerBn: '',
});

export function FaqManager(p: FaqManagerProps) {
  const d = p.dict;
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (ok: string, req: Promise<{ status: number; data: Record<string, unknown> & { error?: string; details?: string[] } }>) => {
    setBusy(true);
    try {
      const a = await req;
      if (a.status < 200 || a.status > 299) return sayBad(refusalText(d, a.data.error, a.data.details));
      say(ok);
      setDraft(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft) return;
    const words = { questionEn: draft.questionEn.trim(), answerEn: draft.answerEn.trim(), questionBn: draft.questionBn.trim() || null, answerBn: draft.answerBn.trim() || null };
    if (!words.questionEn || !words.answerEn) return sayBad(t(d, 'products.faq.both'));
    return run(
      t(d, 'products.faq.saved'),
      draft.id
        ? call('PATCH', `/api/admin/faqs/${draft.id}`, words)
        : call('POST', '/api/admin/faqs', {
            scope: draft.scope,
            ...(draft.scope === 'PRODUCT' ? { productId: draft.productId } : {}),
            ...(draft.scope === 'CATEGORY' ? { categoryId: draft.categoryId } : {}),
            ...words,
          }),
    );
  };

  const row = (f: FaqItem) => (
    <div key={f.id} className={`fq-li${f.isActive ? '' : ' off'}`} data-testid="faq-row" data-scope={f.scope}>
      <div className="fq-q">
        {f.questionEn}
        {!f.isActive ? <span className="a2-pill line">{t(d, 'products.faq.hidden')}</span> : null}
        {f.fromQuestion ? <span className="a2-pill line">{t(d, 'products.faq.fromQuestion')}</span> : null}
      </div>
      <div className="a2-sm">{f.answerEn}</div>
      {f.scope !== 'SHOP' ? <div className="a2-xs a2-mute">{f.where}</div> : null}
      {p.canWrite ? (
        <div className="fq-acts">
          {!f.archived ? (
            <>
              <button
                type="button"
                className="a2-btn"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    id: f.id,
                    scope: f.scope,
                    productId: '',
                    categoryId: '',
                    questionEn: f.questionEn,
                    answerEn: f.answerEn,
                    questionBn: f.questionBn ?? '',
                    answerBn: f.answerBn ?? '',
                  })
                }
              >
                {t(d, 'products.faq.edit')}
              </button>
              <button
                type="button"
                className="a2-btn"
                disabled={busy}
                onClick={() => run(t(d, f.isActive ? 'products.faq.hiddenNow' : 'products.faq.shownNow'), call('PATCH', `/api/admin/faqs/${f.id}`, { isActive: !f.isActive }))}
              >
                {t(d, f.isActive ? 'products.faq.hide' : 'products.faq.show')}
              </button>
              <button
                type="button"
                className="a2-btn"
                disabled={busy}
                onClick={() => window.confirm(t(d, 'products.faq.confirmArchive')) && run(t(d, 'products.faq.archivedNow'), call('DELETE', `/api/admin/faqs/${f.id}`))}
              >
                {t(d, 'products.faq.archive')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="a2-btn"
              disabled={busy}
              onClick={() => run(t(d, 'products.faq.broughtBack'), call('POST', `/api/admin/faqs/${f.id}`, { unarchive: true }))}
            >
              {t(d, 'products.faq.bringBack')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );

  const group = (scope: FaqItem['scope']) => {
    const list = p.items.filter((i) => i.scope === scope);
    return (
      <section className="a2-card" data-testid={`faq-group-${scope.toLowerCase()}`}>
        <h2 className="a2-h">{t(d, `products.faq.sec_${scope}`)}</h2>
        <p className="a2-xs a2-mute">{t(d, `products.faq.sec_${scope}_sub`)}</p>
        {list.length ? list.map(row) : <p className="a2-sm a2-mute">{t(d, 'products.faq.none')}</p>}
      </section>
    );
  };

  return (
    <div data-testid="faq-manager">
      <div className="fq-bar">
        <a className="a2-btn" href={p.showArchived ? p.liveHref : p.archivedHref} data-testid="faq-archived-link">
          {p.showArchived ? t(d, 'products.faq.showLive') : t(d, 'products.faq.showArchived', { n: String(p.archivedCount) })}
        </a>
        {p.canWrite && !p.showArchived ? (
          <button type="button" className="a2-btn pri" onClick={() => setDraft(blank(p))} data-testid="faq-new">
            {t(d, 'products.faq.new')}
          </button>
        ) : null}
      </div>
      {draft ? (
        <section className="a2-card fq-form" data-testid="faq-form">
          <h2 className="a2-h">{t(d, draft.id ? 'products.faq.editTitle' : 'products.faq.new')}</h2>
          {!draft.id ? (
            <div className="lm-fl">
              <label htmlFor="fq-scope">{t(d, 'products.faq.showOn')}</label>
              <select id="fq-scope" className="lm-inp" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as Draft['scope'] })}>
                {(['SHOP', 'CATEGORY', 'PRODUCT'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(d, `products.faq.scope_${s}`)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!draft.id && draft.scope === 'CATEGORY' ? (
            <div className="lm-fl">
              <label htmlFor="fq-cat">{t(d, 'products.faq.category')}</label>
              <select id="fq-cat" className="lm-inp" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {p.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!draft.id && draft.scope === 'PRODUCT' ? (
            <div className="lm-fl">
              <label htmlFor="fq-prod">{t(d, 'products.faq.product')}</label>
              <select id="fq-prod" className="lm-inp" value={draft.productId} onChange={(e) => setDraft({ ...draft, productId: e.target.value })}>
                {p.products.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="lm-fl">
            <label htmlFor="fq-q">{t(d, 'products.faq.question')}</label>
            <input id="fq-q" className="lm-inp" maxLength={300} value={draft.questionEn} onChange={(e) => setDraft({ ...draft, questionEn: e.target.value })} />
          </div>
          <div className="lm-fl">
            <label htmlFor="fq-a">{t(d, 'products.faq.answer')}</label>
            <textarea id="fq-a" className="lm-inp" rows={3} maxLength={2000} value={draft.answerEn} onChange={(e) => setDraft({ ...draft, answerEn: e.target.value })} />
          </div>
          <div className="lm-fl">
            <label htmlFor="fq-qb">{t(d, 'products.faq.questionBn')}</label>
            <input id="fq-qb" className="lm-inp" maxLength={300} value={draft.questionBn} onChange={(e) => setDraft({ ...draft, questionBn: e.target.value })} />
          </div>
          <div className="lm-fl">
            <label htmlFor="fq-ab">{t(d, 'products.faq.answerBn')}</label>
            <textarea id="fq-ab" className="lm-inp" rows={3} maxLength={2000} value={draft.answerBn} onChange={(e) => setDraft({ ...draft, answerBn: e.target.value })} />
          </div>
          <div className="fq-acts">
            <button type="button" className="a2-btn" onClick={() => setDraft(null)} disabled={busy}>
              {t(d, 'products.faq.cancel')}
            </button>
            <button type="button" className="a2-btn pri" onClick={save} disabled={busy} data-testid="faq-save">
              {t(d, 'products.faq.save')}
            </button>
          </div>
        </section>
      ) : null}
      <div className="fq-groups">
        {group('SHOP')}
        {group('CATEGORY')}
        {group('PRODUCT')}
      </div>
    </div>
  );
}
