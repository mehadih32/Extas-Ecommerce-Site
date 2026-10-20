// The shop's text fit (demo 03-layout.js fitAll, R15 L05: no word is cut mid-way). A box whose text would be cut
// steps its type down — never below the rule's floor — and, when even that is not enough, takes its collapsed form
// (`.fit-x`, e.g. the footer columns let their links wrap) and fits again. Measured on the real words, so a longer name
// or the other language decides for itself. Browser only.

export interface FitRule {
  sel: string;
  /** The smallest font size, px. */
  min: number;
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
}

function search(list: Item[]): void {
  const set = (it: Item, v: number) => {
    it.fs = v;
    it.el.style.fontSize = `${v.toFixed(2)}px`;
  };
  let todo = list.filter((it) => {
    const ok = fitRatio(it.el, it.rule.box) >= 1;
    if (ok) it.el.style.fontSize = '';
    return !ok;
  });
  if (!todo.length) return;
  todo.forEach((it) => {
    it.lo = Math.min(it.rule.min, it.max);
    it.hi = it.max;
    set(it, it.lo);
  });
  todo = todo.filter((it) => {
    const ok = fitRatio(it.el, it.rule.box) >= 1;
    if (!ok) it.stuck = true;
    return ok;
  });
  for (let n = 0; n < 7 && todo.length; n++) {
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
  for (const rule of rules) {
    root.querySelectorAll<HTMLElement>(rule.sel).forEach((el) => {
      if (!el.getClientRects().length) return;
      el.style.fontSize = '';
      el.classList.remove('fit-x');
      items.push({ el, rule, max: 0, fs: 0, lo: 0, hi: 0, stuck: false });
    });
  }
  if (!items.length) return;
  items.forEach((it) => {
    it.max = Number.parseFloat(getComputedStyle(it.el).fontSize) || 14;
    it.fs = it.max;
  });
  search(items);
  const again = items.filter((it) => it.stuck && it.rule.collapse);
  if (!again.length) return;
  again.forEach((it) => {
    it.stuck = false;
    it.el.classList.add('fit-x');
    it.el.style.fontSize = '';
    it.fs = it.max = Number.parseFloat(getComputedStyle(it.el).fontSize) || it.max;
  });
  search(again);
}
