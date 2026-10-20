// PR 40 / 501 — the footer, drawn from settings exactly as the approved demo draws it (03-layout.js storeFooter,
// ftrDesk): five bands on a phone (promise · brand and Join · link columns · WhatsApp, hotline, hours, social and
// payment marks · legal line with the language switch); at 1024 px and wider the desktop footer's own design takes
// the middle bands' place (D-020): ~~one design~~ the owner's reference layout by default (H13, CN-008), the earlier
// desktop footer kept as `shell.footer.deskStyle` 'classic'. Every word is the dictionary's or the owner's; the numbers and addresses are his
// settings. A promise or a payment mark for Cash on Delivery shows only once he has switched it on, and a contact
// button only once its number is set.
import type { ShopContext } from '@/lib/shop/context';
import { safeExternal, telHref, waHref } from '@/lib/shop/links';
import { footerColumns, footerDeskColumns, footerPromises, joinShown, payMarks, type FooterColumn } from '@/lib/shop/shell-model';
import { GarmentIcon, Icon, PayMark, SocialMark, WaGlyph } from './Icon';
import { JoinForm, type JoinWords } from './JoinForm';
import { LangSwitch } from './LangSwitch';
import { LogoText } from './LogoText';

/** The classic desktop footer's line icons (V12.1). The phone and the reference desktop footer draw SocialMark (V12.2). */
const SOCIAL_ICON = { facebook: 'facebook', instagram: 'instagram', youtube: 'play', tiktok: 'spark' } as const;

function Links({ col }: { col: FooterColumn }) {
  return col.links.map((l) => (
    <a key={l.id} href={l.href} data-act={l.act}>
      <span className="ftr-ic">{l.garment !== undefined ? <GarmentIcon garment={l.garment} size={15} /> : <Icon name={l.icon ?? 'right'} size={15} />}</span>
      <span>{l.label}</span>
    </a>
  ));
}

function Pay({ c, suffix = '' }: { c: ShopContext; suffix?: string }) {
  const ids = payMarks(c.s['shell.footer'], c.flags);
  if (!ids.length) return null;
  const n = ids.length;
  const cols = n <= 5 ? n : Math.ceil(n / 2);
  return (
    <div className={`ftr-pay${n !== 5 ? ' sb-pay-n' : ''}`} style={n !== 5 ? ({ '--sb-pay': cols } as React.CSSProperties) : undefined} aria-label={c.t('footer.pay')}>
      {ids.map((id) => (
        <PayMark key={id} id={id} label={c.t(`pay.${id}`)} idSuffix={suffix} />
      ))}
      <i className="ftr-pay-sheen" aria-hidden="true" />
    </div>
  );
}

/** Every network switched on, with its address when the owner has set one (WhatsApp's is the shop's WhatsApp chat). */
function networks(c: ShopContext, wa: string | null) {
  return c.s['shell.footer'].social
    .filter((x) => x.on)
    .map((x) => ({ id: x.id, url: x.id === 'whatsapp' ? wa : safeExternal(c.s[`social.${x.id}`]), label: c.t(`social.${x.id}`) }));
}

/** The classic desktop footer's linked networks (it keeps its V12.1 look: the four networks with an address). */
function social(c: ShopContext, wa: string | null) {
  return networks(c, wa).filter((x): x is { id: keyof typeof SOCIAL_ICON; url: string; label: string } => x.id !== 'whatsapp' && Boolean(x.url));
}

/**
 * V12.2 (Note 54 #2, Note 58 A): the phone footer's social row — every network switched on as a tile, a full-width row
 * sized like the payment marks under it; one without its address yet is shown, not linked (98c-n54.js ftrPhoneSoc).
 * ~~only the networks with an address, as labelled tiles (.ftr-soc)~~
 */
function SocRow({ c, wa }: { c: ShopContext; wa: string | null }) {
  const list = networks(c, wa);
  if (!list.length) return null;
  return (
    <div className="ftr-soc2" data-testid="ftr-soc-phone" style={{ '--n': list.length } as React.CSSProperties}>
      {list.map((x) =>
        x.url ? (
          <a key={x.id} className={`fs2 fs2-${x.id}`} href={x.url} target="_blank" rel="noopener" aria-label={c.t('footer.social', { store: c.storeName, network: x.label })}>
            <SocialMark id={x.id} size={x.id === 'whatsapp' ? 16 : 18} />
          </a>
        ) : (
          <span key={x.id} className={`fs2 fs2-${x.id} off`} role="img" aria-label={x.label} title={x.label}>
            <SocialMark id={x.id} size={18} />
          </span>
        ),
      )}
    </div>
  );
}

function HoursLine({ c }: { c: ShopContext }) {
  const h = c.s['contact.hours'];
  const email = c.s['contact.email'];
  const hours = h ? h[c.lang] || h.en : '';
  if (!hours && !email) return null;
  return (
    <>
      {hours}
      {hours && email ? ' · ' : null}
      {email ? <a href={`mailto:${email}`}>{email}</a> : null}
    </>
  );
}

export function StoreFooter({ c }: { c: ShopContext }) {
  const t = c.t;
  const F = c.s['shell.footer'];
  const K = F.contact;
  const name = c.storeName;
  const slogan = c.s['brand.slogan'] ? c.s['brand.slogan'][c.lang] || c.s['brand.slogan'].en : '';
  const opts = { combos: c.s['shell.desktopNav'].combos };
  const cols = footerColumns(F, c.cats, t, false, c.vars, opts);
  const dcols = footerColumns(F, c.cats, t, true, c.vars, opts);
  const promises = footerPromises(F, c.flags, t, c.vars);
  const wa = K.whatsapp ? waHref(c.s['contact.whatsapp'], t('footer.waMessage', c.vars)) : null;
  const soc = social(c, wa);
  const tel = K.hotline ? telHref(c.s['contact.phone']) : null;
  const hot = c.s['contact.phone'] ?? '';
  const join: JoinWords = {
    label: t('footer.join.label'),
    placeholder: t('footer.join.placeholder'),
    button: t('footer.join.button'),
    note: t('footer.join.note'),
    thanksTo: t('footer.join.thanksTo'),
    problems: { empty: t('footer.join.empty'), short: t('footer.join.short'), prefix: t('footer.join.prefix') },
  };
  const ref = F.desktop && F.deskStyle !== 'classic';
  const nD = dcols.length + (joinShown(F, c.flags) ? 1 : 0);
  const socLinks = soc.map((x) => (
    <a key={x.id} href={x.url} target="_blank" rel="noopener" aria-label={t('footer.social', { store: name, network: x.label })}>
      <Icon name={SOCIAL_ICON[x.id]} size={16} />
      <span>{x.label}</span>
    </a>
  ));
  const ids = F.legal.ids;
  return (
    <footer className={`ftr${F.desktop ? ' ftr-hasd' : ''}${ref ? ' ftr-hasref' : ''}`}>
      {promises.length ? (
        <div className="ftr-s ftr-s1">
          <div className="container" style={{ padding: 0 }}>
            <div
              className="ftr-promise"
              style={promises.length !== 4 ? ({ '--sb-pr': promises.length } as React.CSSProperties) : undefined}
              data-n={promises.length !== 4 ? promises.length : undefined}
            >
              {promises.map((p) => (
                <div key={p.id}>
                  <Icon name={p.icon} size={20} />
                  <span>
                    {p.parts.map((part, i) => (
                      <span key={i}>
                        {i ? <br className="hide-d" /> : null}
                        {part}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="ftr-s ftr-s2">
        <div className="container">
          <div className="ftr-brand">
            <div className="ftr-brand-top">
              <div className="logo">{name}</div>
              <div className="xs ftr-brand-sub">{slogan}</div>
            </div>
            {joinShown(F, c.flags) ? <JoinForm id="join" variant="phone" words={join} /> : null}
          </div>
        </div>
      </div>
      {cols.length ? (
        <div className="ftr-s ftr-s3">
          <div className="container">
            <div className="ftr-cols" data-n={cols.length !== 3 ? cols.length : undefined}>
              {cols.map((col) => (
                <div key={col.id}>
                  <span className="ftr-h">{col.title}</span>
                  <Links col={col} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="ftr-s ftr-s4">
        <div className="container">
          <div className="ftr-contact">
            <div className="ftr-reach">
              {wa ? (
                <a className="btn btn-block ftr-wa" href={wa} target="_blank" rel="noopener">
                  <WaGlyph size={22} />
                  <span>{t('footer.whatsapp')}</span>
                </a>
              ) : null}
              {tel ? (
                <a className="btn btn-block ftr-hot" href={tel}>
                  <Icon name="phone" size={19} />
                  <span>
                    {t('footer.hotline')} {hot}
                  </span>
                </a>
              ) : null}
              {K.hours ? (
                <div className="xs center ftr-hours">
                  <HoursLine c={c} />
                </div>
              ) : null}
            </div>
            <SocRow c={c} wa={wa} />
            <Pay c={c} />
          </div>
        </div>
      </div>
      {ref ? <DeskRef c={c} join={join} wa={wa} tel={tel} hot={hot} /> : null}      {F.desktop && !ref ? (
        <div className="ftr-s ftr-d hide-m" data-testid="ftr-desk">
          <div className="container">
            <div className="ftr-d-top">
              <div className="ftr-d-brand">
                <div className="logo">{name}</div>
                <div className="xs ftr-brand-sub">{slogan}</div>
              </div>
            </div>
            <div className="ftr-d-cols" data-n={nD !== 4 ? nD : undefined} data-join={nD !== 4 && joinShown(F, c.flags) ? '1' : undefined}>
              {dcols.map((col) => (
                <div key={col.id} className="ftr-d-col">
                  <span className="ftr-h">{col.title}</span>
                  <Links col={col} />
                </div>
              ))}
              {joinShown(F, c.flags) ? (
                <div className="ftr-d-col ftr-d-join">
                  <span className="ftr-h">{t('footer.join.title')}</span>
                  <JoinForm id="join-d" variant="desk" words={join} />
                </div>
              ) : null}
            </div>
            <div className="ftr-d-contact">
              <div className="ftr-d-cl">
                {socLinks.length ? <div className="ftr-d-soc">{socLinks}</div> : null}
                <Pay c={c} suffix="-d" />
              </div>
              <div className="ftr-d-reach">
                {wa ? (
                  <a className="btn ftr-wa ftr-d-wa" href={wa} target="_blank" rel="noopener">
                    <WaGlyph size={20} />
                    <span>{t('footer.whatsapp')}</span>
                  </a>
                ) : null}
                {tel ? (
                  <a className="btn ftr-hot ftr-d-hot" href={tel}>
                    <Icon name="phone" size={18} />
                    <span>
                      {t('footer.hotline')} {hot}
                    </span>
                  </a>
                ) : null}
                {K.hours ? (
                  <div className="xs ftr-d-hours">
                    <HoursLine c={c} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="ftr-s ftr-s5">
        <div className="container ftr-legalbar">
          <div className="row between">
            <span className="ftr-legal">
              {t.label(F.legal.copyright, c.vars)}
              {ids && c.s['legal.dbid'] ? (
                <>
                  <span className="ftr-sep"> · </span>
                  {t('footer.dbid', { id: c.s['legal.dbid'] })}
                </>
              ) : null}
              {ids && c.s['legal.tradeLicence'] ? (
                <>
                  <span className="ftr-sep"> · </span>
                  {t('footer.tradeLicence', { id: c.s['legal.tradeLicence'] })}
                </>
              ) : null}
            </span>
            <LangSwitch c={c} />
          </div>
        </div>
      </div>
    </footer>
  );
}

/** H13 (CN-008) · the desktop footer in the owner's reference layout (demo ftrDeskRef): brand + Join on the left, the
 * link columns between dividers, WhatsApp, hours, hotline, social and payment badges on the right. */
function DeskRef({ c, join, wa, tel, hot }: { c: ShopContext; join: JoinWords; wa: string | null; tel: string | null; hot: string }) {
  const t = c.t;
  const F = c.s['shell.footer'];
  const K = F.contact;
  const cols = footerDeskColumns(F, c.cats, t, c.vars, { combos: c.s['shell.desktopNav'].combos });
  const slogan = c.s['brand.slogan'] ? c.s['brand.slogan'][c.lang] || c.s['brand.slogan'].en : '';
  const soc = networks(c, wa);
  const pay = payMarks(F, c.flags);
  // V12.2 (Note 58 C, demo ftrCols2): the social row and the payment row share one column count, so they line up
  const nCols = Math.max(soc.length, pay.length, 1);
  return (
    <div className="ftr-s ftr-d ftr-dref hide-m" data-testid="ftr-desk">
      <div className="container">
        <div className="fdr-grid" style={{ '--fdr-n': cols.length } as React.CSSProperties}>
          <div className="fdr-left">
            <div className="fdr-brand">
              <span className="logo">
                <LogoText text={c.storeName} styleNo={c.s['brand.logoStyle']} />
              </span>
              <span className="fdr-slog">{slogan}</span>
            </div>
            {joinShown(F, c.flags) ? <JoinForm id="join-d" variant="ref" words={join} /> : null}
          </div>
          {cols.map((col) => (
            <nav key={col.id} className="fdr-col" aria-label={col.title}>
              <span className="ftr-h">{col.title}</span>
              {col.links.map((l) => (
                <a key={l.id} href={l.href} data-act={l.act} className={l.hl ? 'fdr-hl' : undefined}>
                  {F.deskIcons ? (
                    <>
                      <span className="fdr-ic" aria-hidden="true">
                        {l.garment !== undefined ? <GarmentIcon garment={l.garment} size={15} /> : <Icon name={l.icon ?? 'right'} size={15} />}
                      </span>
                      <span>{l.label}</span>
                    </>
                  ) : (
                    l.label
                  )}
                </a>
              ))}
            </nav>
          ))}
          <div className="fdr-right">
            {wa ? (
              <a className="fdr-wa" href={wa} target="_blank" rel="noopener">
                <WaGlyph size={18} />
                <span>{t('footer.whatsappDesk')}</span>
              </a>
            ) : null}
            {/* V12.2 (Note 58 B): the Hotline is its own box, like the WhatsApp box, right under it; the hours follow.
                ~~hours, then a plain hotline line~~ */}
            {tel ? (
              <a className="fdr-hot" href={tel}>
                <Icon name="phone" size={17} />
                <span>
                  {t('footer.hotline')} <b>{hot}</b>
                </span>
              </a>
            ) : null}
            {K.hours ? (
              <div className="fdr-hours">
                <HoursLine c={c} />
              </div>
            ) : null}
            {/* V12.2 (Note 54 #2, Note 58 C): each network's own mark in a row of tiles over the payment marks.
                ~~line icons with the network's name~~ */}
            {soc.length ? (
              <div className="fdr-soc" style={{ '--n': nCols } as React.CSSProperties}>
                {soc.map((x) =>
                  x.url ? (
                    <a
                      key={x.id}
                      className={`fdr-si fdr-si-${x.id}`}
                      href={x.url}
                      target="_blank"
                      rel="noopener"
                      aria-label={t('footer.social', { store: c.storeName, network: x.label })}
                      title={x.label}
                    >
                      <SocialMark id={x.id} size={17} />
                    </a>
                  ) : (
                    <span key={x.id} className={`fdr-si fdr-si-${x.id} fdr-soc-off`} role="img" aria-label={x.label} title={`${x.label} · ${t('footer.socialOff')}`}>
                      <SocialMark id={x.id} size={17} />
                    </span>
                  ),
                )}
              </div>
            ) : null}
            {pay.length ? (
              <div className="fdr-pay" style={{ '--n': nCols } as React.CSSProperties} aria-label={t('footer.pay')}>
                {pay.map((id) => (
                  <PayMark key={id} id={id} label={t(`pay.${id}`)} idSuffix="-r" badge />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
