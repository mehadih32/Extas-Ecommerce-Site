// PR 629 (CN-036, LUMEN-SPEC §3 items 5–6) — the form + live preview and the settings switch cards as the server draws
// them: the checklist with Publish off until it is complete; switches off as shipped with their number fields folded
// away, open when on; numbers kept inside their bounds.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-shell.bn.json';
import en from '../../../../messages/admin-shell.en.json';
import type { Dict } from '@/lib/i18n';
import { LumenProvider } from './context';
import { FormPreview, type FormPreviewProps } from './FormPreview';
import { clampField, SettingCards, type SettingCardField } from './SettingCards';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const draw = (el: ReactElement, dict: Dict = en as Dict) => renderToStaticMarkup(<LumenProvider value={{ dict, undoSeconds: 5, pageStep: 12 }}>{el}</LumenProvider>);
const save = { method: 'PUT' as const, url: '/api/admin/settings/cards' };

const form: FormPreviewProps = {
  fields: [
    { name: 'name', label: 'Name', kind: 'text', required: true },
    { name: 'price', label: 'Price', kind: 'number', unit: '৳' },
    { name: 'image', label: 'Photo', kind: 'text' },
  ],
  checks: [
    { id: 'n', label: 'A name of 3 letters or more', field: 'name', rule: 'minLength', arg: 3 },
    { id: 'p', label: 'A price', field: 'price', rule: 'min', arg: 1 },
  ],
  preview: { title: 'name', price: 'price', image: 'image' },
  priceFormat: { locale: 'en-IN', currency: 'BDT' },
  publish: { label: 'Publish', call: { method: 'POST', url: '/api/admin/products' }, done: 'Published' },
};

describe('form + live preview', () => {
  it('keeps Publish off and lists what is missing', () => {
    const html = draw(<FormPreview {...form} />);
    expect(html).toContain('Ready to publish?');
    expect(html).toContain('0 of 2 done');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="lm-form-publish"/);
    expect(html).toContain('The name shows here as you type');
  });

  it('turns Publish on and fills the preview when everything is there, never drawing an outside image', () => {
    const html = draw(<FormPreview {...form} initial={{ name: 'Textured polo', price: '1450', image: 'javascript:alert(1)' }} />);
    expect(html).toContain('2 of 2 done');
    expect(html).not.toMatch(/disabled=""[^>]*data-testid="lm-form-publish"/);
    expect(html).toContain('Textured polo');
    expect(html).toContain('৳1,450');
    expect(html).not.toContain('src="javascript:');
    expect(html).not.toContain('<img');
    expect(draw(<FormPreview {...form} initial={{ image: '/media/p.jpg' }} />)).toContain('src="/media/p.jpg"');
  });

  it('speaks Bengali', () => {
    expect(draw(<FormPreview {...form} />, bn as Dict)).toContain('প্রকাশ করার জন্য তৈরি?');
  });
});

describe('settings switch cards', () => {
  const fields: SettingCardField[] = [{ name: 'days', label: 'Days', kind: 'number', value: 3, min: 1, max: 30, step: 1, unit: 'days' }];

  it('draws one switch per card, off as shipped with its fields folded away', () => {
    const html = draw(<SettingCards save={save} cards={[{ key: 'late', title: 'Late parcel alert', on: false, fields }]} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toMatch(/class="lm-fold" hidden=""/);
  });

  it('opens the number field when the switch is on', () => {
    const html = draw(<SettingCards save={save} cards={[{ key: 'late', title: 'Late parcel alert', on: true, fields }]} />);
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toMatch(/class="lm-fold" hidden=""/);
    expect(html).toContain('value="3"');
  });

  it('keeps numbers inside their bounds and keeps the old value for nonsense', () => {
    const f = fields[0]!;
    expect(clampField(f, '45', 3)).toBe(30);
    expect(clampField(f, '0', 3)).toBe(1);
    expect(clampField(f, '7.6', 3)).toBe(8);
    expect(clampField(f, '', 3)).toBe(3);
    expect(clampField(f, 'abc', 3)).toBe(3);
    const sel: SettingCardField = { name: 'mode', label: 'Mode', kind: 'select', value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] };
    expect(clampField(sel, 'b', 'a')).toBe('b');
    expect(clampField(sel, 'zzz', 'a')).toBe('a');
  });
});
