// S08 · PR 193 — Delivery › Delivery settings (demo 97t-adm2-delivery.js /admin/delivery/settings; docs/ADMIN-ARCHITECTURE.md:
// settings inside their section): first the holiday mode card (Blueprint B1.14) — the switch, the break's first and
// last day, how many days before the notice shows, and the words of the notice and of the checkout's "ships from …";
// then the sticker's Latin address line (SIM-F-048, PR 179 follow-up) and the delivery promise per district (SIM-F-048,
// PR 550 follow-up), and the voice address at checkout (CN-020 (4), SIM-F-047, PR 117 follow-up).
// Seeing needs `delivery.read`; saving `delivery.charges` (the API checks again). Off as shipped. The demo's other
// cards (stuck hours, book after packing, the suggestion rule, the exact-amount line, trial at delivery) join with
// their PRs. Guide: docs/admin-guide/pages/delivery/settings.md.
// S08 · PR 176 follow-up 370: then the courier cards — reading the couriers (`delivery.courier.tracking`), booking with
// the courier (`delivery.courier.booking`), the courier by cost (`delivery.courier.selection`, PR 178) and the couriers'
// own status calls (`delivery.courier.webhooks`, follow-up 372); each saved whole with the same permission.
// Follow-up 431: the couriers' own area lists (`delivery.courier.zoneSync`, PR 554), until now only shown.
// Follow-up 462: "More options · Packing" (a disclosure, closed) — the packing step's five cards (`fulfilment.packing.*`):
// the piece check, the packing photo, the parcel's weight, the packing lists and a defective or missing piece (its hold
// and edit reasons picked from the owner's own lists). Until now only shown as chips on the Pack page.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { PACKING_CHECK_MODES, ZONE_UNMAPPED_RULES } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withEta } from '@/lib/admin-eta';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { deliveryDistrictOptions, deliverySettingCards } from '@/lib/delivery-settings-api';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/delivery/settings';
const API = '/api/admin/delivery/settings';
const KEY = 'deliverySettings';

export async function generateMetadata(): Promise<Metadata> {
  const view = withEta(await adminView());
  return { title: t(view.dict, 'eta.holiday.metaTitle'), robots: { index: false, follow: false } };
}

export default async function DeliverySettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withEta(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const at = { storeId: MOTHER_STORE_ID };
  const [cards, districts, holdReasons, editReasons] = await Promise.all([
    deliverySettingCards({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx }),
    deliveryDistrictOptions(access.deps),
    access.deps.resolver.value('orders.hold.reasons', at),
    access.deps.resolver.value('orders.edit.reasons', at),
  ]);
  const canEdit = access.guard.permissions?.has('delivery.charges') ?? false;
  const h = (k: string) => t(d, `eta.holiday.${k}`);
  const texts: FieldsCardTexts = {
    h: h('h'),
    d: h('d'),
    save: h('save'),
    saving: h('saving'),
    saved: h('saved'),
    discard: h('discard'),
    unsaved: h('unsaved'),
    readOnly: h('readOnly'),
    pairHelp: h('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, h(`err.${c}`)])),
  };
  const lang = { en: t(d, 'eta.eid.langEn'), bn: t(d, 'eta.eid.langBn') };
  const pair = (k: string) => ({ en: `${h(k)} · ${lang.en}`, bn: `${h(k)} · ${lang.bn}` });
  const holiday: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: h('enabled'), help: h('enabledHelp') },
    { kind: 'date', path: 'from', label: h('from') },
    { kind: 'date', path: 'to', label: h('to') },
    { kind: 'number', path: 'showDaysBefore', label: h('showDaysBefore'), help: h('showDaysBeforeHelp'), min: 0, max: 30 },
    { kind: 'pair', path: 'notice', label: pair('notice'), max: 200 },
    { kind: 'pair', path: 'promise', label: pair('promise'), max: 200 },
  ];
  const c = cards['delivery.holiday'];
  const sk = (k: string) => t(d, `eta.sticker.${k}`);
  const latin = cards['delivery.sticker.latin'];
  const pk = (k: string) => t(d, `eta.promise.${k}`);
  const promise = cards['delivery.promise.districts'];
  const bn = view.lang === 'bn';
  const vk = (k: string) => t(d, `eta.voice.${k}`);
  const voice = cards['checkout.voice'];
  const CONFIDENCE = ['0.3', '0.5', '0.6', '0.7', '0.8', '0.9'];
  const voiceFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: vk('enabled'), help: vk('enabledHelp') },
    { kind: 'text', path: 'speechLang', label: vk('speechLang'), help: vk('speechLangHelp'), max: 10 },
    { kind: 'select', path: 'minConfidence', label: vk('minConfidence'), help: vk('minConfidenceHelp'), numeric: true, options: CONFIDENCE.map((v) => ({ value: v, label: vk(`conf.${v.replace('.', '')}`) })) },
    { kind: 'switch', path: 'keepRecording', label: vk('keepRecording'), help: vk('keepRecordingHelp') },
    { kind: 'number', path: 'maxSeconds', label: vk('maxSeconds'), min: 5, max: 120 },
    { kind: 'number', path: 'maxKb', label: vk('maxKb'), min: 64, max: 4096 },
    { kind: 'number', path: 'maxPerHour', label: vk('maxPerHour'), help: vk('maxPerHourHelp'), min: 1, max: 60 },
  ];
  const promiseFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: pk('enabled'), help: pk('enabledHelp') },
    {
      kind: 'rows',
      path: 'rows',
      label: pk('rows'),
      help: pk('rowsHelp'),
      max: 80,
      add: pk('add'),
      remove: pk('remove'),
      empty: pk('empty'),
      columns: [
        { kind: 'select', key: 'district', label: pk('district'), pick: pk('pick'), options: districts.map((o) => ({ value: o.code, label: (bn ? o.nameBn : null) ?? o.nameEn })) },
        { kind: 'number', key: 'hoursMin', label: pk('hoursMin'), min: 1, max: 1440, optional: true },
        { kind: 'number', key: 'hoursMax', label: pk('hoursMax'), min: 1, max: 1440 },
      ],
    },
  ];
  // follow-up 370: the courier cards
  const ck = (k: string) => t(d, `eta.courier.${k}`);
  const card = (key: 'delivery.courier.tracking' | 'delivery.courier.booking' | 'delivery.courier.selection' | 'delivery.courier.webhooks' | 'delivery.courier.zoneSync') => ({ key: cards[key].key, value: cards[key].value, version: cards[key].version });
  const trackingFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: ck('tracking.enabled'), help: ck('tracking.enabledHelp') },
    { kind: 'number', path: 'everyMinutes', label: ck('tracking.everyMinutes'), help: ck('tracking.everyMinutesHelp'), min: 5, max: 1440 },
    { kind: 'number', path: 'batch', label: ck('tracking.batch'), help: ck('tracking.batchHelp'), min: 1, max: 2000 },
  ];
  const bookingFields: FieldsCardField[] = [
    { kind: 'number', path: 'giftLeadDays', label: ck('booking.giftLeadDays'), help: ck('booking.giftLeadDaysHelp'), min: 0, max: 30 },
    { kind: 'pair', path: 'giftNote', label: { en: `${ck('booking.giftNote')} · ${lang.en}`, bn: `${ck('booking.giftNote')} · ${lang.bn}` }, help: ck('booking.giftNoteHelp'), max: 200 },
    { kind: 'select', path: 'noteLang', label: ck('booking.noteLang'), options: [{ value: 'en', label: lang.en }, { value: 'bn', label: lang.bn }] },
    { kind: 'switch', path: 'itemNames', label: ck('booking.itemNames'), help: ck('booking.itemNamesHelp') },
    { kind: 'number', path: 'maxPerRun', label: ck('booking.maxPerRun'), help: ck('booking.maxPerRunHelp'), min: 1, max: 500 },
  ];
  const selectionFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: ck('selection.enabled'), help: ck('selection.enabledHelp') },
    { kind: 'switch', path: 'codFee', label: ck('selection.codFee'), help: ck('selection.codFeeHelp') },
  ];
  const webhookFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: ck('webhooks.enabled'), help: ck('webhooks.enabledHelp') },
    { kind: 'number', path: 'maxBodyKb', label: ck('webhooks.maxBodyKb'), help: ck('webhooks.maxBodyKbHelp'), min: 1, max: 1024 },
  ];
  const zoneFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: ck('zoneSync.enabled'), help: ck('zoneSync.enabledHelp') },
    { kind: 'number', path: 'everyDays', label: ck('zoneSync.everyDays'), min: 1, max: 90 },
    { kind: 'number', path: 'callsPerRun', label: ck('zoneSync.callsPerRun'), help: ck('zoneSync.callsPerRunHelp'), min: 10, max: 5000 },
    { kind: 'switch', path: 'areas', label: ck('zoneSync.areas'), help: ck('zoneSync.areasHelp') },
    { kind: 'switch', path: 'autoMatch', label: ck('zoneSync.autoMatch'), help: ck('zoneSync.autoMatchHelp') },
    { kind: 'select', path: 'unmapped', label: ck('zoneSync.unmapped'), help: ck('zoneSync.unmappedHelp'), options: ZONE_UNMAPPED_RULES.map((v) => ({ value: v, label: ck(`zoneSync.rules.${v}`) })) },
  ];
  // follow-up 462: the packing step's cards, under More options
  const pa = (k: string, vars?: Record<string, string>) => t(d, `eta.packing.${k}`, vars);
  const packCard = (key: 'fulfilment.packing.check' | 'fulfilment.packing.photo' | 'fulfilment.packing.weight' | 'fulfilment.packing.queue' | 'fulfilment.packing.issues') => ({ key: cards[key].key, value: cards[key].value, version: cards[key].version });
  /** A reason picker from the owner's list; a key no longer on it stays choosable, marked. */
  const reasonOptions = (list: readonly { key: string; en: string; bn: string }[], current: unknown) => {
    const opts = list.map((r) => ({ value: r.key, label: (bn ? r.bn : '') || r.en }));
    return typeof current === 'string' && current && !opts.some((o) => o.value === current) ? [...opts, { value: current, label: pa('issues.missing', { key: current }) }] : opts;
  };
  const issues = cards['fulfilment.packing.issues'].value;
  const checkFields: FieldsCardField[] = [
    { kind: 'select', path: 'mode', label: pa('check.mode'), help: pa('check.modeHelp'), options: PACKING_CHECK_MODES.map((v) => ({ value: v, label: pa(`check.modes.${v}`) })) },
    { kind: 'switch', path: 'allowTyped', label: pa('check.allowTyped'), help: pa('check.allowTypedHelp') },
  ];
  const photoFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: pa('photo.enabled'), help: pa('photo.enabledHelp') },
    { kind: 'select', path: 'mode', label: pa('photo.mode'), help: pa('photo.modeHelp'), options: ['required', 'reminder'].map((v) => ({ value: v, label: pa(`photo.modes.${v}`) })) },
    { kind: 'number', path: 'minPhotos', label: pa('photo.minPhotos'), min: 1, max: 10 },
    { kind: 'number', path: 'keepDays', label: pa('photo.keepDays'), help: pa('photo.keepDaysHelp'), min: 1, max: 3650 },
  ];
  const weightFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: pa('weight.enabled'), help: pa('weight.enabledHelp') },
    { kind: 'number', path: 'gapPercent', label: pa('weight.gapPercent'), min: 1, max: 100 },
    { kind: 'number', path: 'gapGrams', label: pa('weight.gapGrams'), help: pa('weight.gapHelp'), min: 1, max: 100_000 },
    { kind: 'switch', path: 'requireReading', label: pa('weight.requireReading') },
  ];
  const queueFields: FieldsCardField[] = [
    { kind: 'number', path: 'doneDays', label: pa('queue.doneDays'), help: pa('queue.doneDaysHelp'), min: 0, max: 30 },
    { kind: 'number', path: 'listMax', label: pa('queue.listMax'), help: pa('queue.listMaxHelp'), min: 10, max: 500 },
  ];
  const issueFields: FieldsCardField[] = [
    { kind: 'switch', path: 'holdOrder', label: pa('issues.holdOrder'), help: pa('issues.holdOrderHelp') },
    { kind: 'select', path: 'damagedReasonKey', label: pa('issues.damagedReasonKey'), options: reasonOptions(holdReasons, issues.damagedReasonKey) },
    { kind: 'select', path: 'missingReasonKey', label: pa('issues.missingReasonKey'), options: reasonOptions(holdReasons, issues.missingReasonKey) },
    { kind: 'select', path: 'editReasonKey', label: pa('issues.editReasonKey'), options: reasonOptions(editReasons, issues.editReasonKey) },
    { kind: 'number', path: 'decideWithinHours', label: pa('issues.decideWithinHours'), help: pa('issues.decideWithinHoursHelp'), min: 0, max: 720 },
  ];
  return (
    <div className="a2-z" data-testid="delivery-settings" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={h('title')} sub={h('sub')} />
      <SectionTabs view={view} current={KEY} />
      <FieldsCard url={API} screen={{ key: c.key, value: c.value, version: c.version }} fields={holiday} texts={texts} canEdit={canEdit} testId="delivery-holiday" />
      <FieldsCard
        url={API}
        screen={{ key: latin.key, value: latin.value, version: latin.version }}
        fields={[{ kind: 'switch', path: 'enabled', label: sk('enabled'), help: sk('enabledHelp') }]}
        texts={{ ...texts, h: sk('h'), d: sk('d') }}
        canEdit={canEdit}
        testId="delivery-sticker-latin"
      />
      <FieldsCard url={API} screen={{ key: promise.key, value: promise.value, version: promise.version }} fields={promiseFields} texts={{ ...texts, h: pk('h'), d: pk('d') }} canEdit={canEdit} testId="delivery-promise" />
      <FieldsCard url={API} screen={{ key: voice.key, value: voice.value, version: voice.version }} fields={voiceFields} texts={{ ...texts, h: vk('h'), d: vk('d') }} canEdit={canEdit} testId="delivery-voice" />
      <h2 className="a2-h4 a2-mt12" data-testid="delivery-courier-cards">
        {ck('heading')}
      </h2>
      <FieldsCard url={API} screen={card('delivery.courier.tracking')} fields={trackingFields} texts={{ ...texts, h: ck('tracking.h'), d: ck('tracking.d') }} canEdit={canEdit} testId="delivery-courier-tracking" />
      <FieldsCard url={API} screen={card('delivery.courier.booking')} fields={bookingFields} texts={{ ...texts, h: ck('booking.h'), d: ck('booking.d') }} canEdit={canEdit} testId="delivery-courier-booking" />
      <FieldsCard url={API} screen={card('delivery.courier.selection')} fields={selectionFields} texts={{ ...texts, h: ck('selection.h'), d: ck('selection.d') }} canEdit={canEdit} testId="delivery-courier-selection" />
      <FieldsCard url={API} screen={card('delivery.courier.webhooks')} fields={webhookFields} texts={{ ...texts, h: ck('webhooks.h'), d: ck('webhooks.d') }} canEdit={canEdit} testId="delivery-courier-webhooks" />
      <FieldsCard url={API} screen={card('delivery.courier.zoneSync')} fields={zoneFields} texts={{ ...texts, h: ck('zoneSync.h'), d: ck('zoneSync.d') }} canEdit={canEdit} testId="delivery-courier-zones" />
      {/* the browser opens it before hydration when the address names #packing: that `open` is expected */}
      <details className="a2-mt12" data-testid="delivery-more" suppressHydrationWarning>
        <summary className="a2-btn ghost" style={{ listStyle: 'none', width: 'fit-content' }}>
          {pa('more')}
        </summary>
        {/* the Pack page links here (#packing): a link to a part of a closed disclosure opens it */}
        <p className="a2-sm a2-mute a2-mt6" id="packing">
          {pa('moreNote')}
        </p>
        <FieldsCard url={API} screen={packCard('fulfilment.packing.check')} fields={checkFields} texts={{ ...texts, h: pa('check.h'), d: pa('check.d') }} canEdit={canEdit} testId="delivery-packing-check" />
        <FieldsCard url={API} screen={packCard('fulfilment.packing.photo')} fields={photoFields} texts={{ ...texts, h: pa('photo.h'), d: pa('photo.d') }} canEdit={canEdit} testId="delivery-packing-photo" />
        <FieldsCard url={API} screen={packCard('fulfilment.packing.weight')} fields={weightFields} texts={{ ...texts, h: pa('weight.h'), d: pa('weight.d') }} canEdit={canEdit} testId="delivery-packing-weight" />
        <FieldsCard url={API} screen={packCard('fulfilment.packing.queue')} fields={queueFields} texts={{ ...texts, h: pa('queue.h'), d: pa('queue.d') }} canEdit={canEdit} testId="delivery-packing-queue" />
        <FieldsCard url={API} screen={packCard('fulfilment.packing.issues')} fields={issueFields} texts={{ ...texts, h: pa('issues.h'), d: pa('issues.d') }} canEdit={canEdit} testId="delivery-packing-issues" />
      </details>
    </div>
  );
}
