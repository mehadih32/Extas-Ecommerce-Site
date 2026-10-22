// The shop's text fit (demo 03-layout.js fitAll, R15 L05: no word is cut mid-way). A box whose text would be cut
// steps its type down — never below the rule's floor — and, when even that is not enough, takes its collapsed form
// (`.fit-x`, e.g. the footer columns let their links wrap) and fits again. Measured on the real words, so a longer name
// or the other language decides for itself. Browser only.

export interface FitRule {
  sel: string;
  /** The smallest font size, px. */
  min: number;
  /** The floor on a desktop (≥ 1024 px) when it differs (D1.4: never under 11 px there). */
  minDesk?: number;
  /** Count the box itself running out of room (a row whose children refuse to shrink). */
  box?: boolean;
  /** One collapse step (.fit-x) when the floor is not enough. */
  collapse?: boolean;
}

function hasText(e: Element): boolean {
  for (let c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.textContent?.trim()) return true;
  return false;
}

/** How much of the widest cut text would fit (1 = nothing is cut). */
export function fitRatio(box: HTMLElement, whole = false): number {
  let r = 1;
  const els = [box, ...Array.from(box.querySelectorAll<HTMLElement>('*'))];
  if (whole) {
    const bs = getComputedStyle(box);
    const br = box.getBoundingClientRect();
    const inner = br.left + box.clientLeft + box.clientWidth - (Number.parseFloat(bs.paddingRight) || 0);
    const left = br.left + box.clientLeft + (Number.parseFloat(bs.paddingLeft) || 0);
    let far = inner;
    for (let c = box.firstElementChild; c; c = c.nextElementSibling) {
      const cr = c.getBoundingClientRect();
      if (cr.width && cr.right > far) far = cr.right;
    }
    if (far > inner + 0.5) r = Math.max(0.05, (inner - left) / (far - left));
  }
  for (const e of els) {
    const cw = e.clientWidth;
    const sw = e.scrollWidth;
    if (!cw || sw <= cw + 0.5) continue;
    if (!(whole && e === box) && !hasText(e)) {
      const ox = getComputedStyle(e).overflowX;
      if (ox !== 'hidden' && ox !== 'clip') continue;
    }
    const cs = getComputedStyle(e);
    const pad = (Number.parseFloat(cs.paddingLeft) || 0) + (Number.parseFloat(cs.paddingRight) || 0);
    const k = Math.max(0.05, (cw - pad) / Math.max(1, sw - pad));
    if (k < r) r = k;
  }
  return r;
}

interface Item {
  el: HTMLElement;
  rule: FitRule;
  max: number;
  fs: number;
  lo: number;
  hi: number;
  stuck: boolean;
  floor: number;
}

/**
 * PR 43 · the hero pictures' pins (demo 20-home.js fitRule): the whole name and the price on the picture at any phone
 * width — the name steps down, never under 9 px (11 px on a desktop, D-006); only when even that cannot hold both does
 * the pin keep the name alone (.fit-x).
 */
export const HERO_PIN_FIT: FitRule = { sel: '.hm-slider .hm-sl .hm-pin', min: 9, minDesk: 11, collapse: true };

/** A rule's floor for this screen. */
export function fitFloor(rule: FitRule, desktop: boolean): number {
  return desktop && rule.minDesk != null ? rule.minDesk : rule.min;
}

function search(list: Item[]): void {
  const set = (it: Item, v: number) => {
    it.fs = v;
    it.el.style.fontSize = `${v.toFixed(2)}px`;
  };
  // Every pass reads all boxes first and only then writes, so one pass costs one layout of the page, not one per box
  // (PR 43: the home page's pins made the old read-write-read order a long task while the page loaded).
  const measure = (items: Item[]) => items.map((it) => fitRatio(it.el, it.rule.box));
  const r0 = measure(list);
  let todo = list.filter((_, i) => r0[i]! < 1);
  if (!todo.length) return;
  // A line of text scales with its type, so the measured share is a close first guess: most boxes fit at once.
  const ratio = new Map(list.map((it, i) => [it, r0[i]!]));
  todo.forEach((it) => {
    it.lo = Math.min(it.floor, it.max);
    it.hi = it.max;
    set(it, Math.max(it.lo, Math.min(it.max, it.max * ratio.get(it)! * 0.99)));
  });
  const atGuess = measure(todo);
  todo = todo.filter((it, i) => {
    if (atGuess[i]! >= 1) return false;
    it.hi = it.fs;
    return true;
  });
  if (!todo.length) return;
  todo.forEach((it) => set(it, it.lo));
  const atFloor = measure(todo);
  todo = todo.filter((it, i) => {
    if (atFloor[i]! < 1) it.stuck = true;
    return atFloor[i]! >= 1;
  });
  for (let n = 0; n < 5 && todo.length; n++) {
    todo.forEach((it) => set(it, (it.lo + it.hi) / 2));
    const fits = todo.map((it) => fitRatio(it.el, it.rule.box) >= 1);
    todo.forEach((it, i) => {
      if (fits[i]) it.lo = it.fs;
      else it.hi = it.fs;
    });
  }
  todo.forEach((it) => set(it, it.lo));
}

export function fitAll(root: ParentNode, rules: readonly FitRule[]): void {
  const items: Item[] = [];
  const desktop = typeof matchMedia === 'function' && matchMedia('(min-width:1024px)').matches;
  const copies: Array<{ el: HTMLElement; rule: FitRule }> = [];
  for (const rule of rules) {
    const floor = fitFloor(rule, desktop);
    root.querySelectorAll<HTMLElement>(rule.sel).forEach((el) => {
      // a sliding row's copy (PR 42 clones) takes its card's result instead of being measured again
      if (el.closest('[data-clone]')) return void copies.push({ el, rule });
      if (!el.getClientRects().length) return;
      el.style.fontSize = '';
      el.classList.remove('fit-x');
      items.push({ el, rule, max: 0, fs: 0, lo: 0, hi: 0, stuck: false, floor });
    });
  }
  if (!items.length) return;
  items.forEach((it) => {
    it.max = Number.parseFloat(getComputedStyle(it.el).fontSize) || 14;
    it.fs = it.max;
  });
  search(items);
  const again = items.filter((it) => it.stuck && it.rule.collapse);
  again.forEach((it) => {
    it.stuck = false;
    it.el.classList.add('fit-x');
    it.el.style.fontSize = '';
    it.fs = it.max = Number.parseFloat(getComputedStyle(it.el).fontSize) || it.max;
  });
  if (again.length) search(again);
  copyToClones(items, copies);
}

/** A copy shows the same words as its card, so it takes the card's fitted size and collapse step. */
function copyToClones(items: readonly Item[], copies: ReadonlyArray<{ el: HTMLElement; rule: FitRule }>): void {
  if (!copies.length) return;
  const done = new Map<string, Item>();
  for (const it of items) done.set(`${it.rule.sel}\u0000${it.el.textContent ?? ''}`, it);
  for (const c of copies) {
    const it = done.get(`${c.rule.sel}\u0000${c.el.textContent ?? ''}`);
    c.el.style.fontSize = it ? it.el.style.fontSize : '';
    c.el.classList.toggle('fit-x', !!it && it.el.classList.contains('fit-x'));
  }
}
