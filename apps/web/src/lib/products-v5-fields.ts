// S28 · PR 680-685 — the settings cards of the product screens, as the plain lists FieldsCard draws (words from the
// page's dictionary, so no function crosses from the server page to the card).
import type { FieldsCardField, FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { t, type Dict } from '@/lib/i18n';

/** The card's texts from `<base>.ui.*` (save, saving, saved, discard, unsaved, readOnly, err.*). */
export function fieldsTexts(d: Dict, base: string, h: string, desc: string): FieldsCardTexts {
  return {
    h: t(d, h),
    d: t(d, desc),
    save: t(d, `${base}.ui.save`),
    saving: t(d, `${base}.ui.saving`),
    saved: t(d, `${base}.ui.saved`),
    discard: t(d, `${base}.ui.discard`),
    unsaved: t(d, `${base}.ui.unsaved`),
    readOnly: t(d, `${base}.ui.readOnly`),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, t(d, `${base}.ui.err.${k}`)])),
  };
}

/** PR 680 — Photo checks (`media.quality`). */
export function photoCheckFields(d: Dict): FieldsCardField[] {
  const n = (path: string, min: number, max: number): FieldsCardField => ({
    kind: 'number',
    path,
    label: t(d, `products.pm.checks.${path}`),
    help: t(d, `products.pm.checks.${path}Help`),
    min,
    max,
  });
  return [
    {
      kind: 'switch',
      path: 'on',
      label: t(d, 'products.pm.checks.on'),
      help: t(d, 'products.pm.checks.onHelp'),
    },
    n('minSide', 100, 6000),
    n('sharpnessMin', 1, 127),
    n('darkBelow', 1, 200),
    n('ratioTolerancePct', 0, 50),
    n('edgeBusy', 1, 128),
  ];
}

/** PR 681 — Video settings (`catalogue.video`). */
export function videoFields(d: Dict): FieldsCardField[] {
  return [
    { kind: 'switch', path: 'on', label: t(d, 'products.vid.checks.on'), help: t(d, 'products.vid.checks.onHelp') },
    { kind: 'switch', path: 'allowUpload', label: t(d, 'products.vid.checks.allowUpload'), help: t(d, 'products.vid.checks.allowUploadHelp') },
    { kind: 'number', path: 'maxUploadMb', label: t(d, 'products.vid.checks.maxUploadMb'), help: t(d, 'products.vid.checks.maxUploadMbHelp'), min: 1, max: 500 },
    { kind: 'switch', path: 'playOnTap', label: t(d, 'products.vid.checks.playOnTap'), help: t(d, 'products.vid.checks.playOnTapHelp') },
    {
      kind: 'checks',
      path: 'providers',
      label: t(d, 'products.vid.checks.providers'),
      options: ['YOUTUBE', 'VIMEO', 'FACEBOOK'].map((v) => ({ value: v, label: v === 'YOUTUBE' ? 'YouTube' : v === 'VIMEO' ? 'Vimeo' : 'Facebook' })),
    },
  ];
}

/** PR 682 — FAQ settings (`catalogue.faq`). */
export function faqFields(d: Dict): FieldsCardField[] {
  return [
    { kind: 'switch', path: 'on', label: t(d, 'products.faq.checks.on'), help: t(d, 'products.faq.checks.onHelp') },
    { kind: 'switch', path: 'includeShop', label: t(d, 'products.faq.checks.includeShop'), help: t(d, 'products.faq.checks.includeShopHelp') },
    { kind: 'number', path: 'max', label: t(d, 'products.faq.checks.max'), help: t(d, 'products.faq.checks.maxHelp'), min: 1, max: 50 },
    { kind: 'switch', path: 'markup', label: t(d, 'products.faq.checks.markup'), help: t(d, 'products.faq.checks.markupHelp') },
  ];
}
