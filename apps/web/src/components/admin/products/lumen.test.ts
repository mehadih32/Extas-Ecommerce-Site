// PR 634 (CN-036) — the product screens in the Lumen look: their words go through the admin's one toast (showToast),
// a refusal in the "bad" tone, and the bulk bar's Undo exists only for reversible shop actions (publish ↔ take off,
// archive ↔ restore), never for "check again" and never for anything that touches a price.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastShown, TOAST_EVENT, type ToastAsk } from '../lumen/Toast';
import { undoAllowed } from '@/lib/admin-lumen/safety';
import { BULK_UNDO } from './ProductList';
import { say, sayBad } from './useToast';

describe('product screens speak through the one toast', () => {
  const seen: ToastAsk[] = [];
  afterEach(() => {
    seen.length = 0;
    vi.unstubAllGlobals();
  });
  const listen = () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    vi.stubGlobal('CustomEvent', class<T> extends Event {
      detail: T;
      constructor(type: string, init: { detail: T }) {
        super(type);
        this.detail = init.detail;
      }
    });
    target.addEventListener(TOAST_EVENT, (e) => seen.push((e as CustomEvent<ToastAsk>).detail));
  };

  it('say shows the text; sayBad shows it in the bad tone', () => {
    listen();
    say('Saved');
    sayBad('Not allowed');
    expect(seen).toEqual([{ text: 'Saved', undo: undefined }, { text: 'Not allowed', tone: 'bad' }]);
  });

  it('say carries an Undo that the toast draws only for a reversible kind', () => {
    listen();
    say('Archived 2', { kind: 'archive', run: () => true });
    say('Price changed', { kind: 'price', run: () => true });
    expect(toastShown(seen[0]!, 1).canUndo).toBe(true);
    expect(toastShown(seen[1]!, 2).canUndo).toBe(false);
  });
});

describe('the product list bulk bar Undo', () => {
  it('offers Undo only for reversible kinds, each with its way back', () => {
    for (const [action, u] of Object.entries(BULK_UNDO)) {
      expect(undoAllowed(u!.kind)).toBe(true);
      expect(BULK_UNDO[u!.back]?.back).toBe(action);
    }
  });

  it('has no Undo for "check again"', () => {
    expect(BULK_UNDO.recheck).toBeUndefined();
  });
});
