'use client';
// S28 · PR 1032 — wizard step 3, "Colours & sizes" (prototype v5): the ERP's stock per colour and size (read only), a tick to keep a
// size or a colour off the shop, the name each colour has on the site, a set's colour link, and the B-grade ("Outlet") listing.
// Every change saves by itself; sizes and colours kept off are applied when the product goes live.
import { useEffect, useState } from 'react';
import { WIZARD_LINKS, type WizardLink } from '@extas/catalogue';
import { t } from '@/lib/i18n';
import { nameIn } from '../model';
import { Callout, Fld, Seg, Switch, Tag } from '../wizard-ui';
import { postColourName, postSpec } from './api';
import type { Ctx } from './ctx';

export function StepColours({ c }: { c: Ctx }) {
  const { d, data, lang } = c;
  const id = data.productId;
  const [hiddenSizes, setHiddenSizes] = useState<string[]>(data.spec.hiddenSizeIds);
  const [hiddenColours, setHiddenColours] = useState<string[]>(data.spec.hiddenColourIds);
  const [names, setNames] = useState<Record<string, string>>(data.colourNames);
  const [link, setLink] = useState<WizardLink>(data.spec.colourLink ?? 'SAME');
  const [bGrade, setBGrade] = useState(data.spec.bGrade);
  useEffect(() => c.setLive({ hiddenSizeIds: hiddenSizes, hiddenColourIds: hiddenColours, colourNames: names }), [hiddenSizes, hiddenColours, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Parameters<typeof postSpec>[1]) => {
    const a = await postSpec(id, patch);
    if (a.status === 200) c.saved();
    else c.refuse(a);
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const nameOf = (x: { nameEn: string; nameBn: string | null }) => nameIn(lang, x);
  const saveName = async (colourId: string, name: string) => {
    const a = await postColourName(id, colourId, name);
    if (a.status === 200) c.saved();
    else c.refuse(a);
  };
  const shownColours = data.colours.filter((x) => !hiddenColours.includes(x.id));
  const bottom = c.lists.bottoms.find((b) => b.id === data.spec.bottomProductId);

  return (
    <>
      <div className="wzp-box">
        <div className="ad-mini" style={{ marginBottom: 6 }}>
          <b>{t(d, 'products.wiz.col.stock')}</b> <Tag dict={d} kind="e" />
        </div>
        <div className="wzp-tw">
          <table className="wzp-tbl">
            <thead>
              <tr>
                <th>{t(d, 'products.wiz.col.colour')}</th>
                {data.sizes.map((s) => (
                  <th key={s.id}>
                    <label className="wzp-th">
                      <input
                        type="checkbox"
                        checked={!hiddenSizes.includes(s.id)}
                        disabled={!c.can.write}
                        aria-label={t(d, 'products.wiz.col.keepSize', { size: s.label })}
                        onChange={() => {
                          const n = toggle(hiddenSizes, s.id);
                          setHiddenSizes(n);
                          void save({ hiddenSizeIds: n });
                        }}
                      />
                      {s.label}
                    </label>
                  </th>
                ))}
                <th>{t(d, 'products.wiz.col.total')}</th>
                <th>{t(d, 'products.wiz.col.show')}</th>
              </tr>
            </thead>
            <tbody>
              {data.colours.map((x) => (
                <tr key={x.id} className={hiddenColours.includes(x.id) ? 'wzp-off' : undefined}>
                  <td>
                    <span className="wzp-dot" style={{ background: x.hex }} aria-hidden="true" /> {nameOf(x)}
                  </td>
                  {data.sizes.map((s) => {
                    const n = x.bySize[s.id] ?? 0;
                    return (
                      <td key={s.id} className={n === 0 ? 'wzp-zero' : undefined}>
                        {n}
                      </td>
                    );
                  })}
                  <td>
                    <b>{x.total}</b>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!hiddenColours.includes(x.id)}
                      disabled={!c.can.write}
                      aria-label={t(d, 'products.wiz.col.showColour', { colour: nameOf(x) })}
                      onChange={() => {
                        const n = toggle(hiddenColours, x.id);
                        setHiddenColours(n);
                        void save({ hiddenColourIds: n });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, 'products.wiz.col.note')}</div>
      </div>
      <Fld dict={d} label={t(d, 'products.wiz.col.siteNames')} tag="a" hint={t(d, 'products.wiz.col.siteNamesHint')}>
        <div className="wzp-grid2">
          {shownColours.map((x) => (
            <label key={x.id} className="wzp-nm">
              <span className="ad-mini">{nameOf(x)}</span>
              <input className="ad-input" value={names[x.id] ?? ''} placeholder={x.nameEn} maxLength={80} disabled={!c.can.write} onChange={(e) => setNames({ ...names, [x.id]: e.target.value })} onBlur={(e) => void saveName(x.id, e.target.value)} />
            </label>
          ))}
        </div>
      </Fld>
      {data.spec.kind === 'SET' ? (
        <div className="wzp-box" data-testid="wiz-link">
          <div className="ad-mini" style={{ marginBottom: 6 }}>
            <b>{t(d, 'products.wiz.col.setTitle')}</b> <Tag dict={d} kind="y" />
          </div>
          <div className="ad-mini" style={{ marginBottom: 8 }}>{bottom ? t(d, 'products.wiz.col.setBottom', { name: bottom.name, pieces: bottom.pieces }) : t(d, 'products.wiz.col.setNoBottom')}</div>
          <Seg
            label={t(d, 'products.wiz.col.link')}
            value={link}
            options={WIZARD_LINKS.map((k) => [k, t(d, `products.wiz.col.link_${k}`)] as [WizardLink, string])}
            onChange={(v) => {
              setLink(v);
              void save({ colourLink: v });
            }}
            disabled={!c.can.write}
          />
          <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, `products.wiz.col.linkNote_${link}`)}</div>
        </div>
      ) : null}
      <div className="wzp-box" data-testid="wiz-bgrade">
        <Switch
          id="wz-bg"
          checked={bGrade}
          disabled={!c.can.write || data.bGradePieces === 0}
          onChange={(v) => {
            setBGrade(v);
            void save({ bGrade: v });
          }}
          label={t(d, 'products.wiz.col.bgrade')}
        />
        <div className="ad-mini" style={{ marginTop: 6 }}>{data.bGradePieces ? t(d, 'products.wiz.col.bgradeHave', { n: data.bGradePieces }) : t(d, 'products.wiz.col.bgradeNone')}</div>
      </div>
      {!shownColours.length ? <Callout kind="warn">{t(d, 'products.wiz.col.noneShown')}</Callout> : null}
    </>
  );
}
