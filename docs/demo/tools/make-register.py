#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-register.py — প্রহরী Prohori A360-02 · PR 594 (PR register inside the backend)

Reads the master register (and the specification, the review notes, the agent
profiles and the demo's own source headers) and writes two data files for the
admin page #/admin/register (src/96-admin-register.js):

  src/04-register-data.js   var REGISTER = {...}   stages, PRs, history, events
  src/04b-docs-data.js      var DOCS = {...}       the blueprint + supporting .md files

It also keeps a small persistent state file (tools/register-state.json) that
remembers when every stage and PR was first seen and a hash of each PR's text,
so that a new stage / new PR / grown PR text becomes a dated event
("নতুন সেকশন", "PR n যোগ হলো", "PR n-এ নতুন অংশ যোগ হলো").

Idempotent: running it twice with the same inputs writes the same bytes and
reports "no changes". Nothing typed twice: every number comes from the files.
Privacy: phone numbers, e-mail addresses, keys and long digit runs are removed
from everything it embeds; third-party skill copies (agents/skills/*/ext) are
never read.

Usage (run from anywhere):
  python3 tools/make-register.py [--blueprint DIR] [--register FILE] [--src DIR]
                                 [--out-dir DIR] [--state FILE] [--today YYYY-MM-DD]
                                 [--quiet] [--report-json FILE]
"""
import argparse, datetime, difflib, glob, hashlib, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.dirname(HERE)

# ---------------------------------------------------------------- settings
MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
RANGE_EXPAND_MAX = 45          # "PR 304–341" expands; a wider span keeps only its ends
RELATED_EXPAND_MAX = 12        # related-PR links on a card
SCOPE_WARN_TITLE = 0.50        # "should this have been a scope update?" — title overlap …
SCOPE_WARN_TEXT = 0.18         # … and full-text overlap must both reach these
DOCS_LIMIT = 3 * 1024 * 1024

# Where a stage's details live in the specification when its code is not in a
# heading. Matched by heading number; if the number is missing (a renumbered V2)
# the scorer finds the section by code and name instead.
STAGE_SPEC_HINT = {'S00': 'A6.', 'S01': 'B7.4', 'S02': 'D3.', 'S05': 'B1.1', 'S09': 'A3.', 'S11': 'C4', 'S12': 'C4.5',
                   'S14': 'B5.', 'S16': 'B3.9', 'S20': 'B1.3'}   # above this, only blueprint + register + ROUND15 are embedded

# One-line Bengali stage names (the stage table has none). A new stage without
# an entry here gets its English name until someone adds one.
STAGE_BN = {
    'S0A': 'সার্ভারের ভিত', 'S00': 'মূল ভিত ও সেটিংস', 'S01': 'প্রোডাক্ট, ছবি ও ক্যাটালগ',
    'S02': 'দোকানের পেজগুলো', 'S03': 'কম্বো ও সেট', 'S04': 'ব্যাগ, চেকআউট ও অ্যাকাউন্ট',
    'S05': 'অর্ডার সামলানো', 'S06': 'ভুয়া অর্ডার ঠেকানো ও ডেলিভারি এলাকা', 'S07': 'পেমেন্ট ও ওয়ালেট',
    'S08': 'কুরিয়ার, রিটার্ন ও এক্সচেঞ্জ', 'S09': 'স্টক ও ERP সংযোগ', 'S10': 'স্মার্ট রুলস — দোকানের নিয়ম',
    'S11': 'গুগলে খুঁজে পাওয়া (SEO)', 'S12': 'লেখা ও ব্লগ', 'S13': 'মার্কেটিং ও বিজ্ঞাপন',
    'S14': 'কাস্টমার ও CRM', 'S15': 'AI কন্ট্রোল রুম ও এজেন্ট', 'S16': 'হিসাব, খরচ ও রিপোর্ট',
    'S17': 'একাধিক দোকান', 'S18': 'নিরাপত্তা, আইন ও ম্যানুয়াল', 'S19': 'লাইভে তোলা ও ব্যাকআপ',
    'S20': 'প্যাকিং ও কাগজপত্র', 'S21': 'সাইটের স্বাস্থ্য ও অডিট', 'S22': 'কাস্টমার সাপোর্ট',
    'S23': 'সোশ্যাল ও কনটেন্ট স্টুডিও', 'S24': 'ভার্চুয়াল ফটোশুট স্টুডিও', 'S25': 'ভিডিও ও ক্যাম্পেইন স্টুডিও',
    'S26': 'ইনস্টলেশন ও হস্তান্তর প্যাক', 'S27': 'ERP ছাড়া স্টক মডিউল',
}

AGENT_IDS = ['gyani', 'prohori', 'bhandari', 'sawdagor', 'shilpi', 'doot', 'tirondaj']

# Bengali descriptions of the documents in the "Blueprint & files" tab.
DOC_BN = {
    'EXTAS-ECOMMERCE-V': 'পুরো ব্লুপ্রিন্ট — সার্ভার, অর্ডার, টাকা, AI, মার্কেটিং আর ডিজাইনের সব নিয়ম এক ফাইলে',
    'master/MASTER-REGISTER.md': 'সব স্টেজ আর সব PR-এর তালিকা — কোনটা কী করে, কবে যোগ হলো',
    'review/ROUND15.md': 'রাউন্ড ১৫ — মালিকের নোট (সময়সহ) আর কী কী করা হলো',
    'review/CHANGE-PROCESS.md': 'নতুন আইডিয়া বা পরিবর্তন কীভাবে ঢুকবে — কোড চলার সময়, লাইভের পরে, ৬ মাস পরে',
    'review/OWNER-PRECODE-CHECKLIST.md': 'কোড শুরুর আগে মালিকের হাতের কাজের তালিকা',
    'review/SERVER-SETUP-SPEC-OWNER.md': 'সার্ভার সেটআপ ও স্পিড — মালিকের চূড়ান্ত স্পেসিফিকেশন (১৯ অক্টোবর ২৩:৩৩ অনুমোদিত, CN-001)',
    'review/DESKTOP-REVIEW.md': 'ডেস্কটপের রিভিউ আর ঠিক করার হিসাব',
    'review/GOOGLE-TRAFFIC-PLAN.md': 'গুগল থেকে ভিজিটর আনার পরিকল্পনা — /bn পেজ, WordPress থেকে লিংক সরানো, Merchant Center',
    'review/BLOG-CONTENT-PLAN.md': 'ব্লগের পুরো পরিকল্পনা — বিষয়ের তালিকা, ৯০ দিনের ক্যালেন্ডার, মান যাচাই',
    'review/COMBO-RESEARCH.md': 'কম্বো নিয়ে গবেষণা — ক্যাটাগরি, প্রোডাক্ট আর ব্যাগের ৫টা করে ডিজাইন',
    'review/COMBO-RANKING.md': 'কম্বো ডিজাইনগুলোর নম্বর (১০০-এর মধ্যে) — কোনটা জিতল',
    'qa/ECOMMERCE-CHECKLIST.md': 'ই-কমার্স চেকলিস্ট — ৪০০+ পয়েন্ট, গ্রুপ আর গুরুত্ব অনুযায়ী',
    'qa/QA-REPORT-R15.md': 'QA রিপোর্ট R15 — পাওয়া বাগ আর তার অবস্থা',
    'qa/QA-REPORT-R15b.md': 'QA রিপোর্ট R15b — দ্বিতীয় স্বাধীন পরীক্ষা',
    'qa/BLOG-QA-REPORT.md': 'ব্লগ QA রিপোর্ট — ২০টা ডিভাইসে পরীক্ষা',
    'agents/README.md': 'সাত এজেন্টের তালিকা — কে কী কাজ করে',
    'agents/AGENT-PROTOCOL.md': 'এজেন্টরা কীভাবে মনে রাখে — কাজের আগে আর পরে কী করে',
    'agents/CURRICULUM.md': 'এজেন্টদের পড়াশোনার পথ — গ্র্যাজুয়েট থেকে PhD লেভেল',
}

# Demo pages for PRs whose page files do not list PR numbers in their header.
# Every route here is checked against the demo's ROUTES; a dead one is reported.
DEMO_HINTS = [
    ('40-44', '#/'), ('45-48', '#/c/polos'), ('49-58', '#/p/essential-pique-polo'), ('60-69', '#/p/essential-pique-polo'),
    ('71', '#/account/wishlist'), ('72-73', '#/search?q=polo'), ('74', '#/'), ('75', '#/page/faq'), ('82', '#/'), ('84', '#/'),
    ('89-97', '#/combo/polo-duo'), ('98-101', '#/set'), ('102', '#/p/essential-pique-polo'), ('103', '#/combos'),
    ('105-114', '#/bag'), ('115-124', '#/checkout'), ('129-132', '#/account'), ('135', '#/account/orders'), ('137', '#/checkout'),
    ('138-142', '#/admin/orders'), ('145', '#/admin/orders'), ('147', '#/admin/orders'), ('186', '#/exchange/EX-1038'),
    ('208-216', '#/admin/rules'), ('27-28', '#/admin/size-charts'), ('241', '#/journal'), ('254-255', '#/l/polo-duo'),
    ('254', '#/admin/landing'), ('295', '#/admin/reviews'), ('338-339', '#/admin/analytics'), ('304-308', '#/admin/ai'),
    ('317-320', '#/admin/ai'), ('491-492', '#/admin/settings'), ('509-510', '#/admin/settings'), ('549-553', '#/checkout'),
    ('555', '#/checkout'), ('561', '#/checkout'), ('594', '#/admin/register'),
]

STOP = set('''the and for with from that this into each every when then than what which where while only also
their there them they will would must never always more most some same such other others about after before
under over onto your ours our its it's not are was were has have had been being does done make makes made
shop owner page pages order orders customer customers product products from items item one two three four five
settings setting dashboard admin admins system through without within between both same all any can may per
built build uses used using show shows shown like just very well than then here once full'''.split())

PHONE_RE = re.compile(r'(?<!\d)(?:\+?88[-\s]?)?01[3-9]\d{2}[-\s]?\d{6}(?!\d)')
EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}')
KEY_RE = re.compile(r'\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b')
LONGNUM_RE = re.compile(r'(?<![\w.])\d{11,}(?![\w.])')


def scrub(text, counter=None):
    """Remove personal data. Returns the cleaned text; counts removals in counter."""
    if not text:
        return text
    n = [0]

    def rep(label):
        def f(m):
            n[0] += 1
            return label
        return f
    text = EMAIL_RE.sub(rep('[ইমেইল সরানো]'), text)
    text = KEY_RE.sub(rep('[কী সরানো]'), text)
    text = PHONE_RE.sub(rep('[ফোন নম্বর সরানো]'), text)
    text = LONGNUM_RE.sub(rep('[নম্বর সরানো]'), text)
    if counter is not None:
        counter[0] += n[0]
    return text


# ---------------------------------------------------------------- helpers
def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def sha(text, n=12):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:n]


def mdate(path):
    return datetime.datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y-%m-%d')


def parse_date(s, year):
    if not s:
        return None
    m = re.search(r'(20\d\d)-(\d\d)-(\d\d)', s)
    if m:
        return '%s-%s-%s' % m.groups()
    m = re.search(r'\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b', s)
    if m:
        return '%04d-%02d-%02d' % (year, MONTHS[m.group(2).lower()[:3]], int(m.group(1)))
    return None


def parse_time(s):
    if not s:
        return None
    m = re.search(r'(?<![\d.])(\d{1,2}:\d{2})(?:\s?[–-]\s?\d{1,2}:\d{2})?', s)
    return m.group(1).zfill(5) if m else None


def strip_md(s):
    s = re.sub(r'~~.*?~~', '', s)
    s = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)
    s = s.replace('**', '').replace('`', '')
    s = re.sub(r'(?<![\w*])\*(?!\s)([^*]+?)\*(?!\w)', r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()


def slug(s):
    s = strip_md(s).lower()
    s = re.sub(r'[^a-z0-9\u0980-\u09ff]+', '-', s).strip('-')
    return s[:80]


def parse_nums(text, maxn=99999, expand=RANGE_EXPAND_MAX):
    """'11–18, 491–496, 500' -> [11..18, 491..496, 500]"""
    out = []
    for a, b in re.findall(r'(\d{1,4})(?:\s?[–-]\s?(\d{1,4}))?', text or ''):
        a = int(a)
        if b:
            b = int(b)
            if b < a:
                continue
            if b - a <= expand:
                out.extend(range(a, b + 1))
            else:
                out.extend([a, b])
        else:
            out.append(a)
    return [n for n in out if 1 <= n <= maxn]


PR_REF_RE = re.compile(r'\bPRs?\s?((?:\d{1,4}(?:\s?[–-]\s?\d{1,4})?)(?:\s?(?:/|,|\+|&|and|or)\s?\d{1,4}(?:\s?[–-]\s?\d{1,4})?)*)')


def pr_refs(text, maxn, expand=RANGE_EXPAND_MAX):
    out = []
    for m in PR_REF_RE.finditer(text or ''):
        for n in parse_nums(m.group(1), maxn, expand):
            if n not in out:
                out.append(n)
    return out


def stage_codes(text):
    return re.findall(r'\bS(?:0A|\d{2})\b', text or '')


def sentences(text):
    t = re.sub(r'\s+', ' ', text or '').strip()
    parts = re.split(r'(?<=[.!?;])\s+(?=[A-Z*(“"~0-9\u0980-\u09ff])', t)
    return [p.strip() for p in parts if p.strip()]


def words(text):
    t = strip_md(text).lower()
    return set(w for w in re.findall(r'[a-z][a-z-]{3,}', t) if w not in STOP)


def cosine(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / math.sqrt(len(a) * len(b))


def make_title(text):
    t = re.sub(r'^\*\([^)]*\)\*\s*', '', text.strip())
    t = re.sub(r'^~~.*?~~\s*', '', t)
    m = re.match(r'\*\*(.+?)\*\*', t)
    if m:
        title = strip_md(m.group(1))
    else:
        title = strip_md(t)
        for sep in [' — ', '; ', ', with ', ', and the ', '. ']:
            i = title.find(sep)
            if 0 < i:
                title = title[:i]
    title = title.rstrip(' .:—-')
    if len(title) > 90:
        cut = title[:90]
        i = max(cut.rfind(' — '), cut.rfind(', '))
        title = (cut[:i] if i > 30 else cut.rsplit(' ', 1)[0]).rstrip(' ,.—') + '…'
    return title


# ---------------------------------------------------------------- register
def parse_register(path, year_hint=None):
    raw = read(path)
    lines = raw.split('\n')
    R = {'header': {}, 'table': [], 'sections': {}, 'rows': {}, 'arith': [], 'scopeBlocks': [], 'ownerClauses': [],
         'roster': {}, 'issues': [], 'order': [], 'park': {}, 'parkOther': []}
    m = re.search(r'\*\*(\d+) PRs · (\d+) stages · as of ([^*]+)\*\*', raw)
    if m:
        R['header'] = {'prs': int(m.group(1)), 'stages': int(m.group(2)), 'asOfText': m.group(3).strip()}
    m = re.search(r'\*\*(\d+) are (?:built now|active)\. (\d+) are parked\*\*', raw)   # "active" since CN-001 (19 Oct 23:33)
    if m:
        R['header']['built'] = int(m.group(1))
        R['header']['parked'] = int(m.group(2))
    year = year_hint or int((re.search(r'(20\d\d)', R['header'].get('asOfText', '')) or re.search(r'(20\d\d)', '2026')).group(1))
    R['year'] = year
    R['header']['asOf'] = parse_date(R['header'].get('asOfText', ''), year)

    zone = None            # 'table' | 'arith' | 'stage' | 'roster' | None
    cur_stage = None       # stage of the current H2 section
    blk_stage = None       # stage for rows (an "### Sxx addition" block overrides)
    blk = None             # current H3 heading text
    blk_date = blk_time = None
    pending_desc = False
    scope = None           # current "Scope added …" block
    for i, line in enumerate(lines):
        s = line.rstrip()
        if s.startswith('## '):
            scope = None
            h = s[3:].strip()
            m = re.match(r'(S(?:0A|\d{2}))\s*·\s*(.+?)(?:\s+—\s+PR\s+(.+))?$', h)
            if m:
                cur_stage = blk_stage = m.group(1)
                blk = None
                blk_date = blk_time = None
                R['sections'][cur_stage] = {'name': m.group(2).strip(), 'rangeText': (m.group(3) or '').strip(), 'line': i + 1, 'desc': ''}
                zone = 'stage'
                pending_desc = True
                continue
            cur_stage = blk_stage = None
            low = h.lower()
            zone = 'table' if 'stage table' in low else ('roster' if 'build team' in low else None)
            continue
        if s.startswith('### '):
            scope = None
            h = s[4:].strip()
            low = h.lower()
            if 'how this reached' in low or 'arithmetic' in low:
                zone = 'arith'
                continue
            if 'parking lot' in low:
                zone = 'park'
                continue
            if zone in ('arith', 'park'):
                zone = None
            if 'build team' in low:
                zone = 'roster'
                continue
            m = re.match(r'(S(?:0A|\d{2}))\b', h)
            if m:
                blk_stage = m.group(1)
                if zone is None and cur_stage is None:
                    zone = 'stage'
            else:
                blk_stage = cur_stage
            blk = h
            blk_date = parse_date(h, year)
            blk_time = parse_time(h)
            continue
        if pending_desc and s.startswith('*') and not s.startswith('**') and cur_stage:
            R['sections'][cur_stage]['desc'] = strip_md(s)
            pending_desc = False
            continue
        if s.startswith('|') and zone == 'table':
            c = [x.strip() for x in s.strip().strip('|').split('|')]
            if len(c) >= 4 and re.match(r'^S(?:0A|\d{2})$', c[0]):
                cnt = re.sub(r'\D', '', c[2])
                R['table'].append({'code': c[0], 'name': strip_md(c[1]), 'count': int(cnt) if cnt else None,
                                   'rangeText': c[3], 'status': strip_md(c[4]) if len(c) > 4 else ''})
            continue
        if s.startswith('|') and zone == 'arith':
            c = [x.strip() for x in s.strip().strip('|').split('|')]
            if len(c) >= 3 and re.search(r'\d', c[2]) and not set(c[0]) <= set('-: '):
                tot = re.sub(r'\D', '', c[2])
                dm = re.search(r'([+-]\d+)', c[1])
                R['arith'].append({'change': strip_md(c[0]), 'delta': int(dm.group(1)) if dm else 0, 'total': int(tot) if tot else None,
                                   'date': parse_date(c[0], year), 'time': parse_time(c[0])})
            continue
        if s.startswith('|') and zone == 'park':
            c = [x.strip() for x in s.strip().strip('|').split('|')]
            if len(c) >= 3 and not set(c[0]) <= set('-: ') and c[0] != 'Parked':
                e = {'what': strip_md(c[0]), 'size': strip_md(c[1]), 'why': strip_md(c[2])}
                codes = stage_codes(c[0])
                for code in codes:
                    R['park'][code] = e
                if not codes:
                    R['parkOther'].append(e)
            continue
        if zone == 'roster' and s.strip():
            for a in AGENT_IDS:
                if re.search(r'\b' + a + r'\b', s, re.I):
                    R['roster'].setdefault(a, set()).update(stage_codes(s))
            continue
        m = re.match(r'^\|\s*(\d{1,4})\s*\|(.*)$', s)
        if m and blk_stage:
            n = int(m.group(1))
            rest = m.group(2).rstrip()
            if rest.endswith('|'):
                rest = rest[:-1]
            cells = [c.strip() for c in re.split(r'\s\|\s', ' ' + rest + ' ')]
            cells = [c for c in cells if c]
            if n in R['rows']:
                R['issues'].append('PR %d has two rows (lines %d and %d)' % (n, R['rows'][n]['line'], i + 1))
            R['rows'][n] = {'stage': blk_stage, 'cells': cells, 'line': i + 1, 'block': blk, 'blockDate': blk_date, 'blockTime': blk_time,
                            'section': cur_stage}
            R['order'].append(n)
            continue
        # scope / owner-answer blocks (outside the PR tables)
        m = re.match(r'^\*\*(.+?)\*\*\s*(.*)$', s)
        if m and re.search(r'scope|owner answers', m.group(1), re.I):
            head = m.group(1).rstrip(':')
            scope = {'head': head, 'date': parse_date(head, year), 'time': parse_time(head), 'bullets': [], 'line': i + 1}
            R['scopeBlocks'].append(scope)
            if m.group(2).strip():
                for cl in re.split(r';\s+', m.group(2)):
                    R['ownerClauses'].append({'text': cl.strip().rstrip('.'), 'date': scope['date'], 'time': scope['time'], 'head': head})
            continue
        if scope is not None:
            if s.startswith('- '):
                scope['bullets'].append(s[2:].strip())
            elif not s.strip():
                if scope['bullets']:
                    scope = None
            else:
                scope = None
    return R


def stage_nums(rangeText, maxn):
    if not rangeText or rangeText.strip() in ('—', '-', ''):
        return []
    return parse_nums(rangeText, maxn, expand=10000)


# ---------------------------------------------------------------- spec (blueprint)
def md_headings(md):
    """[(level, text, slug, line_index)] with the same de-duplication the page uses."""
    out, seen, fence = [], {}, False
    lines = md.split('\n')
    for i, l in enumerate(lines):
        if l.startswith('```'):
            fence = not fence
            continue
        if fence:
            continue
        m = re.match(r'^(#{1,6})\s+(.+?)\s*#*\s*$', l)
        if m:
            sl = slug(m.group(2)) or 'section'
            if sl in seen:
                seen[sl] += 1
                sl = '%s-%d' % (sl, seen[sl])
            else:
                seen[sl] = 1
            out.append((len(m.group(1)), m.group(2).strip(), sl, i))
    return out, lines


def spec_sections(md):
    heads, lines = md_headings(md)
    secs = []
    part = None
    for k, (lv, text, sl, li) in enumerate(heads):
        if lv == 1:
            pm = re.match(r'Part\s+([A-Z])', text)
            part = pm.group(1) if pm else None
            continue
        end = len(lines)
        for lv2, _, _, li2 in heads[k + 1:]:
            if lv2 <= lv:
                end = li2
                break
        body = '\n'.join(lines[li + 1:end])
        secs.append({'level': lv, 'h': strip_md(text), 'slug': sl, 'part': part, 'body': body, 'line': li + 1})
    return secs


def map_stage_to_spec(code, name, secs):
    hint = STAGE_SPEC_HINT.get(code)
    if hint:
        for s in secs:
            if s['part'] in ('A', 'B', 'C', 'D') and s['h'].startswith(hint + ' '):
                return s, 100
    nw = set(w for w in re.findall(r'[a-z]{4,}', name.lower()) if w not in STOP)
    best, bs = None, 0
    for s in secs:
        if s['part'] not in ('A', 'B', 'C', 'D'):
            continue
        sc = 0
        if re.search(r'\b' + code + r'\b', s['h']):
            sc += 50 - (s['level'] - 2) * 4
        sc += min(10, len(re.findall(r'\b' + code + r'\b', s['body'])))
        hw = set(re.findall(r'[a-z]{4,}', s['h'].lower()))
        sc += 8 * len(nw & hw)
        if sc > bs:
            best, bs = s, sc
    if not best or bs < 8:
        return None, bs
    return best, bs


def excerpt(body, n=700):
    keep = []
    for l in body.split('\n'):
        if re.match(r'^#{1,6}\s', l):
            break
        keep.append(l)
    t = '\n'.join(keep).strip()
    if len(t) > n:
        cut = t[:n]
        i = cut.rfind('\n')
        t = (cut[:i] if i > n * 0.5 else cut.rsplit(' ', 1)[0]) + ' …'
    return t


# ---------------------------------------------------------------- history sources
def note_sections(md, year, fallback_date):
    """Split a review file into dated sections: [{head, date, time, lines:[...]}]"""
    out, cur = [], None
    for l in md.split('\n'):
        m = re.match(r'^(#{2,3})\s+(.+)$', l)
        if m:
            h = m.group(2).strip()
            cur = {'head': strip_md(h), 'date': parse_date(h, year) or (cur['date'] if cur and m.group(1) == '###' else None) or fallback_date,
                   'time': parse_time(h), 'lines': []}
            out.append(cur)
            continue
        if cur is not None and l.strip():
            cur['lines'].append(l)
    return out


def row_text(line):
    if line.startswith('|'):
        c = [x.strip() for x in line.strip().strip('|').split('|')]
        c = [x for x in c if x and not set(x) <= set('-: ')]
        if len(c) >= 2 and re.match(r'^[\d.—–-]+(\s?\(\d{1,2}:\d{2}\))?$', c[0]):
            return ' '.join(c[1:]), parse_time(c[0])
        return ' '.join(c), None
    return re.sub(r'^\s*[-*]\s+', '', line), None


def cap(s, n):
    s = s.strip()
    return s if len(s) <= n else s[:n].rsplit(' ', 1)[0] + ' …'


# ---------------------------------------------------------------- demo routes
def js_routes(src_dir):
    pats = []
    for f in sorted(glob.glob(os.path.join(src_dir, '*.js'))):
        if os.path.basename(f).startswith('04'):
            continue
        t = read(f)
        for m in re.finditer(r'\[\s*/(\^[^\n]*?\$)/\s*,\s*\'([\w-]+)\'\s*\]', t):
            pats.append(m.group(1))
        for m in re.finditer(r'(?:zo_route|zv_route|add)\(\s*/(\^[^\n]*?\$)/\s*,', t):
            pats.append(m.group(1))
    comp = []
    for p in pats:
        try:
            comp.append(re.compile(p.replace('\\/', '/')))
        except re.error:
            pass
    return comp


def route_ok(h, comp):
    path = h[1:].split('?')[0] or '/'
    return any(c.match(path) for c in comp)


def demo_from_headers(src_dir, maxn):
    out = {}
    for f in sorted(glob.glob(os.path.join(src_dir, '*.js'))):
        base = os.path.basename(f)
        if base.startswith('04') or base.startswith('96-'):
            continue
        t = read(f)
        m = re.match(r'\s*/\*(.*?)\*/', t, re.S)
        if not m:
            continue
        head = m.group(1)
        hl = head.split('\n')
        allr = []
        for l in hl:
            for r in re.findall(r'#/[\w/\-~?=&.|<>:]*', l):
                if '<' in r or ':' in r:
                    continue
                allr.append(r)
        first = None
        for r in allr:
            if r not in ('#/',):
                first = r
                break
        for l in hl:
            refs = pr_refs(l, maxn)
            if not refs:
                continue
            rs = [r for r in re.findall(r'#/[\w/\-~?=&.|<>:]*', l) if '<' not in r and ':' not in r]
            r = rs[0] if rs else first
            if not r:
                continue
            r = re.sub(r'(\?[\w]+=[\w-]+)\|.*$', r'\1', r).rstrip('.')
            for n in refs:
                out.setdefault(n, [])
                if r not in [x['h'] for x in out[n]]:
                    out[n].append({'h': r, 'src': base})
    return out


# ---------------------------------------------------------------- agents
def parse_agents(agents_dir, maxn):
    A, stage_own, pr_own = {}, {}, {}
    for a in AGENT_IDS:
        p = os.path.join(agents_dir, a + '.md')
        if not os.path.exists(p):
            continue
        t = read(p)
        h = t.split('\n', 1)[0]
        code = (re.search(r'A360-\d\d', h) or re.search(r'x', 'x')).group(0) if re.search(r'A360-\d\d', h) else ''
        bn = (re.search(r'[\u0980-\u09ff][\u0980-\u09ff\s]*[\u0980-\u09ff]', h) or re.search(r'[\u0980-\u09ff]+', h))
        role = ''
        m = re.search(r'^## Role\s*\n+(.+?)(?:\n\n|\n##)', t, re.M | re.S)
        if m:
            role = strip_md(m.group(1).split('\n')[0])
        owns = ''
        m = re.search(r'^## Owns\s*\n+(.+?)(?:\n\n|\n##)', t, re.M | re.S)
        if m:
            owns = m.group(1).strip()
        A[a] = {'id': a, 'en': a.capitalize(), 'bn': bn.group(0).strip() if bn else '', 'code': code, 'role': cap(role, 160)}
        for c in stage_codes(owns):
            stage_own.setdefault(c, [])
            if a not in stage_own[c]:
                stage_own[c].append(a)
        # explicit PR lists in the Owns line ("S13 paid ads — PR 256 …, 257–258 …")
        if re.search(r'\bPR\b', owns):
            seg = owns[owns.find('PR'):]
            for n in parse_nums(re.sub(r'\bS(?:0A|\d{2})\b', '', seg), maxn, 60):
                pr_own.setdefault(n, a)
    return A, stage_own, pr_own


# ---------------------------------------------------------------- docs
def doc_list(bp):
    items = []
    vs = []
    for p in glob.glob(os.path.join(bp, 'EXTAS-ECOMMERCE-V*.md')):
        m = re.search(r'-V(\d+(?:\.\d+)*)\.md$', p)          # V1, V2, V2.1, V2.2 … (change notes CN-###)
        if m:
            vs.append((tuple(int(x) for x in m.group(1).split('.')), m.group(1), p))
    vs.sort(reverse=True)                                    # highest version first = latest; older ones stay as history
    for i, (_, v, p) in enumerate(vs):
        items.append({'path': os.path.relpath(p, bp), 'ver': 'V' + v, 'latest': i == 0, 'core': True, 'kind': 'blueprint'})
    fixed = ['master/MASTER-REGISTER.md', 'review/ROUND15.md', 'review/GOOGLE-TRAFFIC-PLAN.md', 'review/BLOG-CONTENT-PLAN.md',
             'review/COMBO-RESEARCH.md', 'review/COMBO-RANKING.md', 'qa/ECOMMERCE-CHECKLIST.md']
    fixed += sorted(os.path.relpath(p, bp) for p in glob.glob(os.path.join(bp, 'qa', '*REPORT*.md')))
    fixed += ['review/CHANGE-PROCESS.md', 'review/OWNER-PRECODE-CHECKLIST.md', 'review/SERVER-SETUP-SPEC-OWNER.md',
              'review/DESKTOP-REVIEW.md', 'review/USER-MANUAL.md']
    # Markdown only: the reader renders .md. Non-markdown files (e.g. review/AZURE-VM-GUIDE.pdf) are not embedded.
    fixed = [r for r in fixed if os.path.exists(os.path.join(bp, r))]
    fixed += ['agents/README.md', 'agents/AGENT-PROTOCOL.md', 'agents/CURRICULUM.md']
    for rel in fixed:
        if '/skills/' in rel and '/ext' in rel:
            continue
        if os.path.exists(os.path.join(bp, rel)):
            items.append({'path': rel, 'ver': None, 'latest': False,
                          'core': rel in ('master/MASTER-REGISTER.md', 'review/ROUND15.md'), 'kind': 'support'})
    return items


def doc_id(rel):
    b = os.path.basename(rel)[:-3].lower()
    return re.sub(r'[^a-z0-9]+', '-', b).strip('-')


# ---------------------------------------------------------------- main build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--blueprint', default=os.environ.get('EXTAS_BLUEPRINT', '/home/claude/blueprint'))
    ap.add_argument('--register', default=None)
    ap.add_argument('--src', default=os.path.join(PROTO, 'src'))
    ap.add_argument('--out-dir', default=None)
    ap.add_argument('--state', default=os.path.join(HERE, 'register-state.json'))
    ap.add_argument('--today', default=None)
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--report-json', default=None)
    a = ap.parse_args()
    bp = a.blueprint
    reg_path = a.register or os.path.join(bp, 'master', 'MASTER-REGISTER.md')
    out_dir = a.out_dir or a.src
    today = a.today or datetime.date.today().isoformat()
    rep = {'warnings': [], 'events': [], 'scrubbed': 0}
    redacted = [0]

    R = parse_register(reg_path)
    H = R['header']
    year = R['year']
    asOf = H.get('asOf') or today
    rows = R['rows']
    maxn = max([H.get('prs') or 0] + list(rows.keys()) + [0])

    # ---- stages: the stage table, plus any "## Sxx" section the table misses
    stages, order = {}, []
    for t in R['table']:
        stages[t['code']] = {'code': t['code'], 'name': t['name'], 'tableCount': t['count'], 'rangeText': t['rangeText'],
                             'status': t['status'], 'nums': stage_nums(t['rangeText'], maxn)}
        order.append(t['code'])
    for code, sec in R['sections'].items():
        if code not in stages:
            stages[code] = {'code': code, 'name': sec['name'], 'tableCount': None, 'rangeText': sec['rangeText'], 'status': '',
                            'nums': stage_nums(sec['rangeText'], maxn)}
            order.append(code)
            rep['warnings'].append('stage %s has a section but no stage-table row' % code)
    for code in stages:
        stages[code]['desc'] = R['sections'].get(code, {}).get('desc', '')
        stages[code]['hasSection'] = code in R['sections']
        stages[code]['parked'] = 'parked' in (stages[code]['status'] or '').lower()
        if code in R['park']:
            stages[code]['park'] = R['park'][code]

    # ---- which stage owns each number: row section first, then the stage-table ranges
    pr_stage = {}
    for code in order:
        for n in stages[code]['nums']:
            pr_stage.setdefault(n, code)
    for n, r in rows.items():
        if n in pr_stage and pr_stage[n] != r['stage']:
            rep['warnings'].append('PR %d: row filed under %s but the stage table range puts it in %s' % (n, r['stage'], pr_stage[n]))
        pr_stage[n] = r['stage']
    for code in order:
        if code in R['sections']:
            sec_range = stage_nums(R['sections'][code]['rangeText'], maxn)
            for n in sec_range:
                if n not in pr_stage:
                    pr_stage[n] = code

    # ---- agents
    agents, stage_own, pr_own = parse_agents(os.path.join(bp, 'agents'), maxn)
    if R['roster']:
        stage_own = {}
        for ag, codes in R['roster'].items():
            for c in codes:
                stage_own.setdefault(c, []).append(ag)
        rep['ownerSource'] = 'register roster'
    else:
        rep['ownerSource'] = 'agents/*.md "Owns" lines (the register has no build-team roster)'
    for code in order:
        stages[code]['owners'] = stage_own.get(code, [])

    # ---- spec sections (latest blueprint)
    dl = doc_list(bp)
    latest = next((d for d in dl if d['kind'] == 'blueprint' and d['latest']), None)
    secs = spec_sections(read(os.path.join(bp, latest['path']))) if latest else []
    spec_doc = doc_id(latest['path']) if latest else None
    for code in order:
        s, score = map_stage_to_spec(code, stages[code]['name'], secs)
        stages[code]['spec'] = {'doc': spec_doc, 'h': s['h'], 'slug': s['slug'], 'ex': scrub(excerpt(s['body']), redacted), 'score': score} if s else None

    # ---- PRs
    prs = {}
    for n in range(1, maxn + 1):
        st = pr_stage.get(n)
        r = rows.get(n)
        P = {'n': n, 's': st, 'row': bool(r)}
        if r:
            main_txt = r['cells'][0] if r['cells'] else ''
            extra = r['cells'][1:]
            full = ' | '.join(r['cells'])
            P['t'] = scrub(make_title(main_txt), redacted)
            P['x'] = scrub(main_txt, redacted)
            P['xs'] = [scrub(c, redacted) for c in extra]
            P['blk'] = r['block']
            P['line'] = r['line']
            P['_full'] = full
        else:
            nm = stages[st]['name'] if st else 'Unfiled'
            P['t'] = '%s — PR %d' % (nm, n)
            P['x'] = ''
            P['xs'] = []
            P['_full'] = ''
        P['scope'] = []
        P['dec'] = []
        P['hist'] = []
        prs[n] = P

    # in-row scope notes ("Updated 19 Oct …", "Lifecycle (owner, 19 Oct 11:51): …", "*(19 Oct: …)*")
    lab_re = re.compile(r'\*\*([^*]{2,320}?)\*\*|\*\(([^)]*?\b\d{1,2} (?:Oct|Nov|Sep)[^)]*)\)\*')
    for n, P in prs.items():
        if not P['row']:
            continue
        full = P['_full']
        marks = []
        for m in lab_re.finditer(full):
            lab = m.group(1) or m.group(2)
            dated = re.search(r'\b\d{1,2} (?:Oct|Nov|Sep)\b', lab)
            in_extra = full.find(' | ') >= 0 and m.start() > full.find(' | ')
            if m.group(2):
                marks.append((m.start(), m.end(), lab, True))
            elif dated and (lab.rstrip().endswith(':') or re.match(r'(Updated|Scope|Lifecycle|Standard|Combo SEO)\b', lab)):
                marks.append((m.start(), m.end(), lab, False))
            elif in_extra and lab.rstrip().endswith(':'):
                marks.append((m.start(), m.end(), lab, False))
        for k, (s0, e0, lab, ital) in enumerate(marks):
            end = marks[k + 1][0] if k + 1 < len(marks) else len(full)
            body = full[s0:end] if ital else full[s0:end]
            parts = re.split(r':\s|:$', strip_md(lab).strip(), maxsplit=1)
            label = parts[0].strip(' *')
            if label.startswith('(') and label.endswith(')'):
                label = label[1:-1]
            if ital or re.match(r'^\d{1,2} \w{3}$', label):
                label = 'Update · ' + label
            txt = strip_md(body.replace(' | ', ' '))
            if ital:
                txt = re.sub(r'^\(?[^:]{0,40}:\s*', '', txt).rstrip(')* ')
            elif txt.startswith(strip_md(lab)) and len(parts) > 1 and parts[1].strip():
                txt = parts[1].strip() + txt[len(strip_md(lab)):]
            elif txt.startswith(strip_md(lab)):
                txt = txt[len(strip_md(lab)):].strip()
            txt = txt.lstrip(':)').strip() or strip_md(lab)
            P['scope'].append({'d': parse_date(lab, year) or (marks[k - 1] and None), 'tm': parse_time(lab), 'label': cap(label, 70),
                               'text': scrub(cap(txt, 900), redacted), 'src': 'MASTER-REGISTER · PR %d row' % n})

    # owner decisions inside the row
    dec_re = re.compile(r"\(answers? \d|\banswers? \d|owner decision|owner['’]s decision|\bDecided\b|\(owner\b|owner \d{1,2}:\d{2}|owner accepted|owner, \d{1,2} Oct", re.I)
    for n, P in prs.items():
        if not P['row']:
            continue
        for sn in sentences(strip_md(P['_full'].replace(' | ', ' '))):
            if dec_re.search(sn):
                P['dec'].append({'d': parse_date(sn, year), 'tm': parse_time(sn), 'text': scrub(cap(sn, 500), redacted), 'src': 'MASTER-REGISTER · PR %d row' % n})
        r = rows[n]
        if r['block'] and re.search(r'answer|approved|owner|decid', r['block'], re.I):
            pm = re.search(r'\(([^)]*)\)', r['block'])
            P['dec'].append({'d': r['blockDate'], 'tm': r['blockTime'], 'text': 'Filed from: ' + (pm.group(1) if pm else r['block']),
                             'src': 'MASTER-REGISTER · ' + r['block']})

    # owner-answer clauses + scope bullets outside the tables
    stage_notes = {}
    general = []
    for cl in R['ownerClauses']:
        refs = pr_refs(cl['text'], maxn)
        e = {'d': cl['date'], 'tm': cl['time'], 'text': scrub(strip_md(cl['text']), redacted), 'src': 'MASTER-REGISTER · ' + strip_md(cl['head'])}
        if refs:
            for n in refs:
                prs[n]['dec'].append(e)
        else:
            codes = stage_codes(cl['text'])
            for c in codes:
                stage_notes.setdefault(c, []).append(e)
            if not codes:
                general.append(e)
    for b in R['scopeBlocks']:
        for bl in b['bullets']:
            refs = pr_refs(bl, maxn, RELATED_EXPAND_MAX)
            lm = re.match(r'\*\*(.+?)\*\*', bl)
            e = {'d': b['date'], 'tm': b['time'], 'label': cap(strip_md(lm.group(1)) if lm else 'Scope', 70),
                 'text': scrub(cap(strip_md(bl), 900), redacted), 'src': 'MASTER-REGISTER · ' + strip_md(b['head'])}
            if refs:
                for n in refs:
                    prs[n]['scope'].append(e)
                    if re.search(r'\bowner\b', bl, re.I):
                        prs[n]['dec'].append({'d': e['d'], 'tm': e['tm'], 'text': e['text'], 'src': e['src']})
            else:
                codes = stage_codes(bl)
                for c in codes:
                    stage_notes.setdefault(c, []).append(e)
                if not codes:
                    general.append(e)

    # filed dates: block headings + the arithmetic table (identity numbers ≥ 491)
    for n, r in rows.items():
        if r['blockDate']:
            prs[n]['hist'].append({'d': r['blockDate'], 'tm': r['blockTime'], 'type': 'filed', 'src': 'MASTER-REGISTER', 'note': 'Filed: ' + strip_md(r['block'])})
    positional = 490
    m = re.search(r'PR numbers 1[–-](\d+) run straight through', read(reg_path))
    if m:
        positional = int(m.group(1))
    for st in R['arith']:
        if st['total'] and st['delta'] > 0 and st['total'] - st['delta'] >= positional:
            for n in range(st['total'] - st['delta'] + 1, st['total'] + 1):
                if n in prs:
                    prs[n]['hist'].append({'d': st['date'], 'tm': st['time'], 'type': 'filed', 'src': 'MASTER-REGISTER · arithmetic',
                                           'note': 'Filed: %s (%+d → %d)' % (st['change'], st['delta'], st['total'])})
                    prs[n]['_filedTime'] = prs[n].get('_filedTime') or st['time']

    # review notes and plans
    hist_files = []
    for p in sorted(glob.glob(os.path.join(bp, 'review', 'ROUND*.md'))):
        hist_files.append((p, 'round'))
    if os.path.exists(os.path.join(bp, 'PENDING_CHANGES.md')):
        hist_files.append((os.path.join(bp, 'PENDING_CHANGES.md'), 'round'))
    for rel in ['review/GOOGLE-TRAFFIC-PLAN.md', 'review/BLOG-CONTENT-PLAN.md', 'review/COMBO-RANKING.md', 'qa/BLOG-QA-REPORT.md']:
        if os.path.exists(os.path.join(bp, rel)):
            hist_files.append((os.path.join(bp, rel), 'plan'))
    first_mention = {}
    for p, kind in hist_files:
        name = os.path.basename(p)[:-3]
        md = read(p)
        fd = mdate(p)
        seen_plan = set()
        for sec in note_sections(md, year, fd if kind == 'plan' else None):
            if kind == 'round' and not sec['date']:
                continue
            head_refs = pr_refs(sec['head'], maxn)
            per = {}
            for l in sec['lines']:
                txt, tm = row_text(l)
                for n in pr_refs(txt, maxn):
                    per.setdefault(n, (txt, tm))
            for n in head_refs:
                if n not in per:
                    first = next((row_text(l)[0] for l in sec['lines'] if row_text(l)[0] and not set(row_text(l)[0]) <= set('#|-: ')), sec['head'])
                    per[n] = (first, None)
            for n, (txt, tm) in per.items():
                if n not in prs:
                    continue
                if kind == 'plan':
                    if n in seen_plan:
                        continue
                    seen_plan.add(n)
                e = {'d': sec['date'], 'tm': tm or sec['time'], 'type': 'note' if kind == 'round' else 'plan',
                     'src': '%s · %s' % (name, cap(sec['head'], 80)), 'note': scrub(cap(strip_md(txt), 420), redacted)}
                prs[n]['hist'].append(e)
                if kind == 'round':
                    k = (e['d'] or '', e['tm'] or '99:99')
                    if n not in first_mention or k < first_mention[n]:
                        first_mention[n] = k

    # scope notes on the timeline too
    for n, P in prs.items():
        for s in P['scope']:
            if s.get('d'):
                P['hist'].append({'d': s['d'], 'tm': s.get('tm'), 'type': 'scope', 'src': s['src'], 'note': s['label'] + ': ' + cap(s['text'], 300)})

    # ---- owners and demo routes
    for n, P in prs.items():
        own = []
        if n in pr_own:
            own.append(pr_own[n])
        for ag in (stages[P['s']]['owners'] if P['s'] in stages else []):
            if ag not in own:
                own.append(ag)
        P['own'] = own[:3]
        also = []
        for ag in AGENT_IDS:
            if ag not in own and re.search(r'\b' + ag + r'\b', P['_full'], re.I):
                also.append(ag)
        P['also'] = also
    comp = js_routes(a.src)
    demo = demo_from_headers(a.src, maxn)
    for spec, h in DEMO_HINTS:
        for n in parse_nums(spec, maxn, 1000):
            demo.setdefault(n, [])
            if h not in [x['h'] for x in demo[n]]:
                demo[n].append({'h': h, 'src': 'hint'})
    dead = []
    for n in list(demo.keys()):
        ok = [d for d in demo[n] if route_ok(d['h'], comp)]
        for d in demo[n]:
            if d not in ok:
                dead.append('PR %d → %s (%s)' % (n, d['h'], d['src']))
        demo[n] = ok[:3]
    rep['deadDemoLinks'] = dead

    # ---- related PRs, status
    for n, P in prs.items():
        P['rel'] = [x for x in pr_refs(P['_full'], maxn, RELATED_EXPAND_MAX) if x != n][:24]
        parked = P['s'] in stages and stages[P['s']]['parked']
        P['demo'] = demo.get(n, []) if not parked else []
        P['st'] = 'parked' if parked else ('demo' if P['demo'] else 'built')

    # ---- spec link for every PR (stage section)
    for n, P in prs.items():
        sp = stages[P['s']]['spec'] if P['s'] in stages else None
        if sp:
            P['spec'] = {'doc': sp['doc'], 'h': sp['h'], 'slug': sp['slug']}

    # ================================================================ state + events
    state = None
    if os.path.exists(a.state):
        try:
            state = json.loads(read(a.state))
        except Exception as e:
            rep['warnings'].append('state file unreadable (%s) — starting a new one' % e)
            state = None
    seeded = state is None
    state_before = json.dumps(state, sort_keys=True, ensure_ascii=False) if state else ''
    if seeded:
        state = {'version': 1, 'created': today, 'seq': 0, 'stages': {}, 'prs': {}, 'events': [], 'docs': {}}
    ev = state['events']

    def add_event(e):
        state['seq'] += 1
        e['seq'] = state['seq']
        ev.append(e)
        rep['events'].append(e)

    all_words = {n: words(P['t']) for n, P in prs.items()}
    txt_words = {n: words(P['t'] + ' ' + P['_full']) for n, P in prs.items()}

    def align(n, older):
        P = prs[n]
        out, warn = [], []
        for x in P['rel']:
            if x in older and x not in [o['n'] for o in out]:
                out.append({'n': x, 'why': 'named'})
        scored = []
        for o in older:
            if o == n:
                continue
            tc, xc = cosine(all_words[n], all_words[o]), cosine(txt_words[n], txt_words[o])
            sc = 0.35 * tc + 0.65 * xc
            if tc >= SCOPE_WARN_TITLE and xc >= SCOPE_WARN_TEXT:
                warn.append((round(0.5 * tc + 0.5 * xc, 3), o))
            if prs[o]['s'] == P['s']:
                sc += 0.05
            if sc > 0:
                scored.append((round(sc, 3), o))
        scored.sort(key=lambda t: (-t[0], t[1]))
        same = [t for t in scored if prs[t[1]]['s'] == P['s']]
        if same and same[0][1] not in [o['n'] for o in out]:
            out.append({'n': same[0][1], 'why': 'stage', 'score': same[0][0]})
        k = 0
        for sc, o in scored:
            if k >= 3:
                break
            if o in [x['n'] for x in out]:
                for x in out:
                    if x['n'] == o and 'score' not in x:
                        x['score'] = sc
                k += 1
                continue
            out.append({'n': o, 'why': 'words', 'score': sc})
            k += 1
        warn.sort(key=lambda t: (-t[0], t[1]))
        return out[:8], (warn[0] if warn else (0, None))

    # stages first seen
    for code in order:
        if code not in state['stages']:
            if seeded:
                state['stages'][code] = {'firstSeen': '2026-10-18' if stages[code]['tableCount'] is not None or code == 'S27' else today,
                                         'seed': True, 'name': stages[code]['name']}
            else:
                state['stages'][code] = {'firstSeen': today, 'name': stages[code]['name']}
                add_event({'type': 'new-stage', 'd': today, 'stage': code, 'name': stages[code]['name']})

    # PRs first seen / grown
    known_before = set(int(k) for k in state['prs'].keys())
    seed_new_from = 570
    seed_updates = [220, 224, 235, 237, 244, 503, 571]
    seed_day = '2026-10-19'
    new_list = []
    for n in sorted(prs):
        P = prs[n]
        key = str(n)
        h = sha(P['_full'] or P['t'])
        if key not in state['prs']:
            if seeded:
                filed = sorted([x for x in P['hist'] if x['type'] == 'filed' and x.get('d')], key=lambda x: x['d'])
                fs = filed[0]['d'] if filed else '2026-10-18'
                state['prs'][key] = {'firstSeen': fs, 'hash': h, 'x': P['_full'], 'seed': True}
                if n >= seed_new_from and fs == seed_day:
                    new_list.append(n)
            else:
                state['prs'][key] = {'firstSeen': today, 'hash': h, 'x': P['_full']}
                new_list.append(n)
        else:
            old = state['prs'][key]
            if old.get('hash') != h:
                oldx = old.get('x') or ''
                os_ = set(re.sub(r'\W+', ' ', strip_md(s)).strip().lower() for s in sentences(oldx))
                added = [s for s in sentences(P['_full']) if re.sub(r'\W+', ' ', strip_md(s)).strip().lower() not in os_]
                if not added:
                    sm = difflib.SequenceMatcher(None, oldx, P['_full'])
                    added = [P['_full'][j1:j2] for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag in ('insert', 'replace') and j2 - j1 > 3]
                addtxt = scrub(cap(strip_md(' '.join(added)), 700), redacted) if added else '(wording changed)'
                grew = len(P['_full']) >= len(oldx)
                add_event({'type': 'update' if grew else 'changed', 'd': today, 'pr': n, 'added': addtxt})
                old['hash'] = h
                old['x'] = P['_full']
                old['updated'] = today
    for n in sorted(set(int(k) for k in state['prs']) - set(prs)):
        if not state['prs'][str(n)].get('gone'):
            state['prs'][str(n)]['gone'] = today
            if not seeded:
                add_event({'type': 'removed', 'd': today, 'pr': n})

    older_all = sorted(prs)
    for n in new_list:
        older = [o for o in older_all if o < n or (str(o) in state['prs'] and state['prs'][str(o)].get('firstSeen', '') < state['prs'][str(n)]['firstSeen'])]
        al, best = align(n, [o for o in older if o != n])
        tm = prs[n].get('_filedTime') or (first_mention.get(n, ('', None))[1] if n in first_mention else None)
        if tm == '99:99':
            tm = None
        e = {'type': 'new-pr', 'd': state['prs'][str(n)]['firstSeen'], 'tm': tm, 'pr': n, 'stage': prs[n]['s'], 'aligned': al}
        add_event(e)
        state['prs'][str(n)]['tm'] = tm
        named = [x['n'] for x in al if x['why'] == 'named']
        if best[1] is not None and best[1] not in named:
            add_event({'type': 'scope-warn', 'd': e['d'], 'pr': n, 'like': best[1], 'score': best[0]})
    if seeded:
        for n in seed_updates:
            if n not in prs:
                continue
            P = prs[n]
            dated = [s for s in P['scope'] if s.get('d') == seed_day]
            if dated:
                addtxt = ' · '.join(s['label'] + ': ' + cap(s['text'], 300) for s in dated)
                tm = next((s['tm'] for s in dated if s.get('tm')), None)
            else:
                ss = sentences(strip_md(P['_full'].replace(' | ', ' ')))
                addtxt = ss[-1] if ss else ''
                tm = None
            add_event({'type': 'update', 'd': seed_day, 'tm': tm, 'pr': n, 'added': scrub(cap(addtxt, 700), redacted), 'seed': True})
        ev.sort(key=lambda e: (e['d'] or '', e.get('tm') or '99:99', e.get('pr') or 0))
        for i, e in enumerate(ev):
            e['seq'] = i + 1
        state['seq'] = len(ev)

    # attach state facts to PRs
    for n, P in prs.items():
        sp = state['prs'].get(str(n), {})
        P['first'] = sp.get('firstSeen')
        P['firstTm'] = sp.get('tm')
        for e in ev:
            if e.get('pr') == n and e['type'] in ('update', 'changed'):
                P['hist'].append({'d': e['d'], 'tm': e.get('tm'), 'type': 'update', 'src': 'register-state', 'note': 'আপডেট হয়েছে: ' + e['added']})
            if e.get('pr') == n and e['type'] == 'new-pr':
                P['aligned'] = e['aligned']
        # de-duplicate + sort history
        seen, hl = set(), []
        for x in sorted(P['hist'], key=lambda x: (x.get('d') or '0000', x.get('tm') or '99:99')):
            k = (x.get('d'), x.get('src'), (x.get('note') or '')[:80])
            if k in seen:
                continue
            seen.add(k)
            hl.append(x)
        P['hist'] = hl
        ds = [x['d'] for x in P['hist'] if x.get('d')] + [s['d'] for s in P['scope'] if s.get('d')]
        P['upd'] = max(ds) if ds else None

    # ---- docs
    prev_docs = {}
    docs_path = os.path.join(out_dir, '04b-docs-data.js')
    docs_out = []
    for d in dl:
        p = os.path.join(bp, d['path'])
        md = read(p)
        cnt = [0]
        clean = scrub(md, cnt)
        h = sha(md)
        dst = state['docs'].setdefault(d['path'], {'hist': []})
        if not dst['hist'] or dst['hist'][-1]['hash'] != h:
            dst['hist'].append({'d': mdate(p), 'size': len(md.encode('utf-8')), 'hash': h})
        bnk = 'EXTAS-ECOMMERCE-V' if d['kind'] == 'blueprint' else d['path']
        docs_out.append({'id': doc_id(d['path']), 'path': d['path'], 'name': os.path.basename(d['path']), 'bn': DOC_BN.get(bnk, 'সহায়ক ফাইল'),
                         'ver': d['ver'], 'latest': d['latest'], 'kind': d['kind'], 'core': d['core'], 'size': len(md.encode('utf-8')),
                         'd': mdate(p), 'hash': h, 'hist': dst['hist'][-20:], 'redacted': cnt[0], 'md': clean, 'embedded': True})
        rep['scrubbed'] += cnt[0]
    total = sum(len(x['md'].encode('utf-8')) for x in docs_out)
    if total > DOCS_LIMIT:
        for x in docs_out:
            if not (x['kind'] == 'blueprint' or x['core']):
                x['md'] = None
                x['embedded'] = False
        rep['warnings'].append('documents over 3 MB — only blueprint, register and ROUND15 embedded')

    # ---- totals
    nprs = len(prs)
    built = sum(1 for P in prs.values() if P['st'] != 'parked')
    parked = nprs - built
    indemo = sum(1 for P in prs.values() if P['st'] == 'demo')
    ref_day = max([e['d'] for e in ev if e.get('d')] + [P['upd'] for P in prs.values() if P['upd']] + [asOf])
    week0 = (datetime.date.fromisoformat(ref_day) - datetime.timedelta(days=6)).isoformat()
    changed = sum(1 for P in prs.values() if P['upd'] and P['upd'] >= week0)
    for code in order:
        S = stages[code]
        mem = [n for n in prs if prs[n]['s'] == code]
        S['count'] = len(mem)
        S['rows'] = sum(1 for n in mem if prs[n]['row'])
        S['inDemo'] = sum(1 for n in mem if prs[n]['st'] == 'demo')
        S['bn'] = STAGE_BN.get(code, S['name'])
        S['first'] = state['stages'].get(code, {}).get('firstSeen')
        S['notes'] = stage_notes.get(code, [])
        S['range'] = S['rangeText']
        del S['nums']

    nst = sum(1 for c in order if stages[c]['count'] > 0)

    # ---- parse report
    missing = [n for n in range(1, (H.get('prs') or maxn) + 1) if n not in prs]
    unfiled = [n for n in prs if not prs[n]['s']]
    table_vs = []
    for code in order:
        S = stages[code]
        if S['tableCount'] is not None and S['tableCount'] != S['count']:
            table_vs.append('%s: table says %d, filed %d' % (code, S['tableCount'], S['count']))
    rep.update({
        'register': reg_path, 'asOf': asOf, 'header': H,
        'stagesParsed': len(order), 'stagesWithPRs': nst, 'stageSections': len(R['sections']), 'rows': len(rows), 'rangeOnly': nprs - len(rows),
        'prs': nprs, 'maxPR': maxn, 'missing': missing, 'unfiled': unfiled, 'built': built, 'parked': parked, 'inDemo': indemo,
        'changedWeek': changed, 'weekFrom': week0, 'refDay': ref_day, 'tableVsFiled': table_vs, 'registerIssues': R['issues'],
        'specMap': {c: (stages[c]['spec']['h'] if stages[c]['spec'] else None) for c in order},
        'seeded': seeded,
    })

    # ---- write
    for P in prs.values():
        P.pop('_full', None)
        P.pop('_filedTime', None)
    REG = {
        'asOf': asOf, 'asOfText': H.get('asOfText'), 'refDay': ref_day, 'weekFrom': week0,
        'header': H, 'parkOther': R['parkOther'], 'totals': {'stages': nst, 'stagesAll': len(order), 'prs': nprs, 'built': built, 'parked': parked, 'inDemo': indemo, 'changedWeek': changed,
                                'rows': len(rows), 'rangeOnly': nprs - len(rows)},
        'order': order, 'stages': stages, 'prs': {str(n): prs[n] for n in sorted(prs)}, 'agents': agents,
        'events': ev, 'general': general, 'specDoc': spec_doc,
        'rounds': [x for x in R['arith']],
        'source': {'register': os.path.basename(reg_path), 'registerHash': sha(read(reg_path))},
    }
    DOCS = {'asOf': asOf, 'limit': DOCS_LIMIT, 'docs': docs_out,
            'backup': 'Nightly encrypted backup to Google Drive (PR 395 / 507) carries these documents with everything else.'}

    def js(name, obj):
        s = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        s = s.replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
        return '/* generated by tools/make-register.py — do not edit by hand (PR 594) */\nvar %s = %s;\n' % (name, s)

    os.makedirs(out_dir, exist_ok=True)
    changed_files = []
    for fn, content in (('04-register-data.js', js('REGISTER', REG)), ('04b-docs-data.js', js('DOCS', DOCS))):
        p = os.path.join(out_dir, fn)
        old = read(p) if os.path.exists(p) else None
        if old != content:
            with open(p, 'w', encoding='utf-8') as f:
                f.write(content)
            changed_files.append(fn)
        rep['size_' + fn] = len(content.encode('utf-8'))
    st_txt = json.dumps(state, ensure_ascii=False, sort_keys=True, indent=1)
    if json.dumps(state, sort_keys=True, ensure_ascii=False) != state_before:
        with open(a.state, 'w', encoding='utf-8') as f:
            f.write(st_txt + '\n')
        changed_files.append(os.path.basename(a.state))
    rep['changedFiles'] = changed_files
    rep['scrubbed'] += redacted[0]

    # ---- print
    def p(*x):
        print(*x)
    if not a.quiet:
        p('== PR register parse report (%s) ==' % os.path.basename(reg_path))
        p('header        : %s PRs · %s stages · built %s · parked %s · as of %s' % (H.get('prs'), H.get('stages'), H.get('built'), H.get('parked'), asOf))
        p('stages parsed : %d (stage table %d rows, %d "## Sxx" sections)' % (len(order), len(R['table']), len(R['sections'])))
        p('PRs           : %d (1–%d) · own rows %d · range-only %d · missing %s · unfiled %s' % (nprs, maxn, len(rows), nprs - len(rows), missing or 'none', unfiled or 'none'))
        p('status        : built %d · parked %d · in demo %d · changed in week %s→%s: %d' % (built, parked, indemo, week0, ref_day, changed))
        p('header check  : PRs %s · built %s · parked %s · stages %s' % (
            'OK' if H.get('prs') == nprs else 'MISMATCH', 'OK' if H.get('built') == built else 'MISMATCH (%d)' % built,
            'OK' if H.get('parked') == parked else 'MISMATCH (%d)' % parked, 'OK (%d with PR numbers + %d without)' % (nst, len(order) - nst) if H.get('stages') == nst else 'MISMATCH (%d with numbers, %d rows)' % (nst, len(order))))
        p('owners from   : %s' % rep['ownerSource'])
        p('table vs filed: %s' % ('; '.join(table_vs) if table_vs else 'all match'))
        if rep['warnings']:
            p('warnings      : %d' % len(rep['warnings']))
            for w in rep['warnings'][:12]:
                p('   - ' + w)
            if len(rep['warnings']) > 12:
                p('   … %d more' % (len(rep['warnings']) - 12))
        if dead:
            p('dead demo links: ' + '; '.join(dead))
        p('spec sections : ' + ', '.join('%s→%s' % (c, (stages[c]['spec']['h'][:28] if stages[c]['spec'] else '—')) for c in order))
        p('privacy       : %d value(s) removed (phones / e-mails / keys / long numbers)' % rep['scrubbed'])
        p('docs          : %d files, %.0f KB embedded (limit 3 MB) → 04b-docs-data.js %.0f KB' % (len(docs_out), total / 1024, rep['size_04b-docs-data.js'] / 1024))
        p('register data : 04-register-data.js %.0f KB' % (rep['size_04-register-data.js'] / 1024))
        p('state         : %s%s' % (a.state, ' (seeded now)' if seeded else ''))
        if rep['events']:
            p('events (this run): %d' % len(rep['events']))
            for e in rep['events']:
                if e['type'] == 'new-pr':
                    p('   + PR %d new (%s) · aligned: %s' % (e['pr'], e['stage'], ', '.join('%d%s' % (x['n'], '' if x['why'] == 'named' else '~%.2f' % x.get('score', 0)) for x in e['aligned'][:5])))
                elif e['type'] == 'scope-warn':
                    p('   ! PR %d overlaps PR %d (score %.2f) — should it have been a scope update on PR %d?' % (e['pr'], e['like'], e['score'], e['like']))
                elif e['type'] == 'new-stage':
                    p('   + new stage %s · %s' % (e['stage'], e['name']))
                else:
                    p('   ~ PR %s %s: %s' % (e.get('pr'), e['type'], cap(e.get('added', ''), 100)))
        p('result        : %s' % ('changed: ' + ', '.join(changed_files) if changed_files else 'no changes'))
    else:
        p('register: %d stages (+%d without numbers) · %d PRs · %d events this run · %s' % (nst, len(order) - nst, nprs, len(rep['events']), 'changed: ' + ', '.join(changed_files) if changed_files else 'no changes'))
    if a.report_json:
        with open(a.report_json, 'w', encoding='utf-8') as f:
            json.dump(rep, f, ensure_ascii=False, indent=1, default=list)
    return 0


if __name__ == '__main__':
    sys.exit(main())
