# -*- coding: utf-8 -*-
"""Build /home/claude/blueprint/EXTAS-ECOMMERCE-V2.md from V1 + V2 content + the register."""
import json, re, sys, os
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import content_front as F
import content_inserts as I
import content_new as N

BP = '/home/claude/blueprint'
V1 = open(f'{BP}/EXTAS-ECOMMERCE-V1.md', encoding='utf-8').read()
REG = open(f'{BP}/master/MASTER-REGISTER.md', encoding='utf-8').read()
PROTO = '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto'
RD = open(f'{PROTO}/src/04-register-data.js', encoding='utf-8').read()
RDATA = json.loads(RD[RD.index('{'):RD.rindex('}') + 1])
OUT = f'{BP}/EXTAS-ECOMMERCE-V2.md'
problems = []

# ------------------------------------------------------------ scrub V1 text
for a, b in I.SCRUB:
    V1 = V1.replace(a, b)

# ------------------------------------------------------------ split V1
def idx(s, h):
    m = re.search(r'^' + re.escape(h) + r'\s*$', s, re.M)
    if not m:
        raise SystemExit('heading not found: ' + h)
    return m.start()

iA = idx(V1, '# Part A · Platform, server and architecture')
iE = idx(V1, '# Part E · Stages, the PR plan and the numbers')
iB = idx(V1, '# Part B · Orders, money, support and operations')
iC = idx(V1, '# Part C · AI, marketing and imagery')
iD = idx(V1, '# Part D · UI/UX — IN REVIEW')
iF = idx(V1, '# Part F · Decisions still open')
front, partA, partE, partB, partC, partD, partF = (V1[:iA], V1[iA:iE], V1[iE:iB], V1[iB:iC],
                                                  V1[iC:iD], V1[iD:iF], V1[iF:])

# ------------------------------------------------------------ in-place tags (on all body parts)
body = {'A': partA, 'E': partE, 'B': partB, 'C': partC, 'D': partD, 'F': partF}
for old, new in I.INPLACE:
    hits = [(k, v.count(old)) for k, v in body.items() if old in v]
    total = sum(c for _, c in hits)
    if total != 1:
        problems.append(f'INPLACE {total} hits: {old[:70]!r}')
        continue
    k = hits[0][0]
    body[k] = body[k].replace(old, new)

# ------------------------------------------------------------ heading inserts
def apply_inserts(text):
    for h, block in I.AFTER.items():
        pat = re.compile(r'^' + re.escape(h) + r'[ \t]*\n', re.M)
        ms = list(pat.finditer(text))
        if not ms:
            continue
        if len(ms) > 1:
            problems.append(f'AFTER heading ambiguous: {h}')
            continue
        m = ms[0]
        text = text[:m.end()] + '\n' + block + '\n' + text[m.end():]
        I.AFTER[h] = '__USED__'
    for h, block in I.BEFORE.items():
        if block is None:
            continue
        pat = re.compile(r'^' + re.escape(h) + r'[ \t]*\n', re.M)
        ms = list(pat.finditer(text))
        if not ms:
            continue
        if len(ms) > 1:
            problems.append(f'BEFORE heading ambiguous: {h}')
            continue
        m = ms[0]
        text = text[:m.start()] + block + '\n' + text[m.start():]
        I.BEFORE[h] = None
    return text

for k in ['A', 'B', 'C', 'D', 'F']:
    body[k] = apply_inserts(body[k])
for h, v in I.AFTER.items():
    if v != '__USED__':
        problems.append('AFTER heading not found: ' + h)
for h, v in I.BEFORE.items():
    if v is not None:
        problems.append('BEFORE heading not found: ' + h)

# ------------------------------------------------------------ register parsing
tab = REG[REG.index('## The stage table'):REG.index('### How this reached')]
stages = []
for line in tab.splitlines():
    m = re.match(r'\| (S\w+) \| (.+?) \| (\S+) \| (.*?) \| (.*?) \|$', line)
    if m:
        stages.append(m.groups())

def expand(rng):
    out = []
    for part in rng.split(','):
        part = part.strip()
        if not part or part == '—':
            continue
        if '–' in part:
            a, b = map(int, part.split('–'))
            out += range(a, b + 1)
        else:
            out.append(int(part))
    return out

pr_stage = {}
stage_name = {}
for s, name, cnt, rng, st in stages:
    stage_name[s] = re.sub(r'\*\*', '', name)
    for n in expand(rng):
        pr_stage[n] = s

V1COUNT = {'S0A': 10, 'S00': 8, 'S01': 19, 'S02': 35, 'S03': 16, 'S04': 33, 'S05': 18, 'S06': 9, 'S07': 10,
           'S08': 22, 'S09': 14, 'S10': 14, 'S11': 17, 'S12': 14, 'S13': 30, 'S14': 23, 'S15': 34, 'S16': 14,
           'S17': 22, 'S18': 12, 'S19': 14, 'S20': 7, 'S21': 10, 'S22': 12, 'S23': 9, 'S24': 37, 'S25': 10}
STAGE_OWNER = {'S0A': 'Prohori', 'S00': 'Prohori', 'S01': 'Bhandari', 'S02': 'Sawdagor (design: Shilpi)',
               'S03': 'Sawdagor', 'S04': 'Sawdagor', 'S05': 'Sawdagor', 'S06': 'Gyani', 'S07': 'Sawdagor',
               'S08': 'Bhandari', 'S09': 'Bhandari', 'S10': 'Gyani', 'S11': 'Doot', 'S12': 'Doot (+ 5 authors)',
               'S13': 'Doot; paid ads Tirondaj', 'S14': 'Doot', 'S15': 'Gyani', 'S16': 'Gyani', 'S17': 'Prohori',
               'S18': 'Prohori', 'S19': 'Prohori', 'S20': 'Bhandari', 'S21': 'Prohori', 'S22': 'Gyani',
               'S23': 'Doot', 'S24': 'Gyani', 'S25': 'Gyani', 'S26': '— (parked)', 'S27': '— (parked)'}

rows = []
for s, name, cnt, rng, st in stages:
    v1 = V1COUNT.get(s, '—')
    rows.append(f'| {s} | {name} | {cnt} | {rng} | {v1} | {st} | {STAGE_OWNER.get(s, "")} |')
stage_rows = '\n'.join(rows)

reach = REG[REG.index('### How this reached'):]
reach = reach[reach.index('| Step'):]
reach_lines = []
for line in reach.splitlines():
    if not line.startswith('|'):
        break
    reach_lines.append(line)
reach_table = ('*(The register\'s own table; its heading still reads "How this reached 582" but it runs to 600.)*\n\n'
               + '\n'.join(reach_lines))

# register row text per PR
row_text = {}
for line in REG.splitlines():
    m = re.match(r'^\| (\d+) \| (.+?)\s*\|?\s*$', line)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 600 and n not in row_text:
            row_text[n] = m.group(2)

def clean(t):
    t = re.sub(r'~~.*?~~', '', t)
    t = t.replace('**', '').replace('`', '')
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def short_title(t):
    raw = t
    m = re.match(r'\*\*(.+?)\*\*', raw)
    if m and raw.startswith('**'):
        title = clean(m.group(1))
        rest = clean(raw[m.end():])
        if title.endswith(':') and rest:
            extra = re.split(r'(?<=[.;])\s', rest.lstrip('— ').strip())[0]
            title = title[:-1].rstrip() + ' — ' + extra
        elif len(title) < 40 and rest.startswith('—'):
            extra = rest[1:].strip()
            extra = re.split(r'(?<=[.;])\s', extra)[0]
            title = title + ' — ' + extra
    else:
        c = clean(raw)
        title = re.split(r'\. (?=[A-Z])| \| ', c)[0]
    title = title.replace('|', '/').rstrip(' .;')
    if len(title) > 150:
        cut = title[:147]
        title = cut[:cut.rfind(' ')] + '…'
    return title

OVERRIDE = {
    1: 'New VPS (Ubuntu 24.04 LTS): record specs from the owner\'s screenshot; provider snapshot before any change (updated 19 Oct 22:44)',
    2: 'OS: no in-place upgrade on the new VPS — verify Ubuntu 24.04 LTS and apply all updates (updated 19 Oct 22:44)',
    3: 'Base hardening — SSH keys only, no root login, fail2ban, unattended updates, UFW; ports 22/80/443 opened by us',
    70: 'Site-wide floating WhatsApp button — replaced 19 Oct by the header icon; kept as a switch, off',
    220: 'URL structure and canonical rules — English at /, Bengali at /bn/ behind the translation gate',
    244: 'Approval queue — the owner approves the topic list (monthly batch), not each post (updated 19 Oct)',
    503: 'Language framework — both languages live, Bengali per page behind the gate; admin English by default with a Bengali switch',
}

S22 = ['Support core: conversation/message model, threads, attachments, internal notes, assignment, who-replied log',
       'Channel connectors: Messenger Page API, WhatsApp Business API webhook in and out, website live-chat widget',
       'Identity resolution: phone ↔ PSID ↔ customer matching, merge one person across channels',
       'Customer context panel: order count, delivered/returned ratio, fraud score, live order status',
       'Catalogue drawer: search, send photos, send tracked product link',
       'Mini-cart and one-click order creation with channel tag, stock check and fraud gate',
       'Ticketing: status, owner, SLA timers, resolution time, notifications',
       'AI support agent: answers from Smart Rules, the manual and order data; drafts; handover rules',
       'AI follow-up and conversion: no-order follow-up, offers, win-back, rule-capped',
       'Block list, employee permissions, customer data privacy inside support',
       'Support PWA: installable, support-only shell, push notifications',
       'Support analytics: per employee, per channel, chat → order, first-response and resolution time']
S23 = ['Studio core — brand asset library, templates, rules (part 1)', 'Studio core — brand asset library, templates, rules (part 2)',
       'Video assembly engine — reels, shorts, image posts',
       'Publishing adapters — Facebook Page, Instagram feed/reel/story (part 1)',
       'Publishing adapters — TikTok draft + direct, YouTube (part 2)',
       'Content calendar, approval queue, auto-schedule rules, per-platform limits',
       'Comment and DM ingestion from Facebook, Instagram and TikTok into the Support Inbox']
S24 = ['Asset model, role taxonomy, immutable originals, generated kept separate', 'Model library with consent records',
       'Ghost-mannequin engine', 'Garment prep and standardisation (cut-out, colour, canvas)',
       'Reference analysis and recommendation', 'Provider adapter (FASHN + one other) — part 1',
       'Provider adapter — part 2 (estimate, generate, status, fetch)',
       'Job orchestration: queue, state machine, idempotency — part 1',
       'Job orchestration: per-view retry, concurrency, spend caps — part 2', 'Best-of-2 plus automatic scoring',
       'Detail re-projection for logos and prints', 'Finishing pass (upscale, artifact repair) — part 1',
       'Finishing pass (contact shadow, grade, sharpen) — part 2', 'In-admin image editor',
       'Review and approval UI with side-by-side and reasons', 'Cost ledger, estimates, caps, reuse rules',
       'Recommendation-note system', 'Front-end gallery, angle switcher, zoom, disclosure line',
       'Pilot harness and metrics (cost per approved image, first-pass rate) plus live A/B',
       'Detail finder — part 1', 'Detail finder — part 2', 'Footwear / product-only studio — part 1',
       'Footwear / product-only studio — part 2', 'Download-watermark pipeline',
       'AI 360 wiring and Cost Book rows for every photoshoot sub-job',
       'Category recipe framework with the 13 recipes — part 1', 'Category recipe framework — part 2',
       'Worn-accessory engine (caps, sunglasses, watches, carried bags) — part 1', 'Worn-accessory engine — part 2',
       'Reflective and transparent product handling', 'Ladies, kids and part-model libraries with styling guidelines',
       'Combo and gift-set composition studio', 'Scene library', 'Set product type and two-garment try-on — part 1',
       'Set product type and two-garment try-on — part 2', 'Unisex / couple composition',
       'Occasion scene suggester with previews and approval']
S25 = ['Action / motion library', 'Image-to-video engine with provider adapter and best-of-2 — part 1',
       'Image-to-video engine — part 2', 'Image-to-video engine — part 3',
       'Reel assembly with music, text, logo and aspect variants — part 1', 'Reel assembly — part 2',
       'Campaign creative export — part 1', 'Campaign creative export — part 2',
       'Campaign overlay system — page-level and time-bound', 'Campaign creative brief and three-direction grooming flow']
S17 = ['Store entity and query scoping', 'Store switcher', 'Shared vs separate settings', 'Combined all-stores view',
       'Isolation tests', 'Per-store brand, theme, templates and page layouts',
       'Per-store domain, certificate and Cloudflare routing', 'Per-store ERP mapping to companyId and warehouse',
       'Per-store product listing and stock visibility', 'Per-store payment, courier and SMS accounts',
       'Per-store WhatsApp, Facebook and support-inbox routing', 'Per-store ad accounts, attribution and campaign separation',
       'Per-store SEO with cross-store duplicate-content detection', 'Per-store AI 360 scoping, switches and cost attribution',
       'Theme engine with template sets, component variants and typography packs', 'Store #2 complete theme build',
       'Store #3 complete theme build', 'Per-store Studio identity (model roster, scene style, photo grade)',
       'Per-store AI copy voice and brand tone profile', 'Cross-store sameness guard for look, copy and SEO',
       '"Add store" wizard with domain connection, Cloudflare and certificate automation',
       'S17 item added in UI/UX round 1 (§41.24) — not itemised']
S26 = ['Installer', 'Setup wizard', 'Clean-install check', 'Inline help', 'Bilingual guide', 'Update distribution']

DERIVED = {}
for i, t in enumerate(S22): DERIVED[425 + i] = t + ' (V1 B4.14 item %d)' % (i + 1)
for i, t in enumerate(S23): DERIVED[437 + i] = t + ' (V1 C5.5)'
for i, t in enumerate(S24): DERIVED[444 + i] = t + ' (V1 C7.22 item %d)' % (i + 1)
for i, t in enumerate(S25): DERIVED[481 + i] = t + ' (V1 C8.6 item %d)' % (i + 1)
for i, t in enumerate(S17): DERIVED[356 + i] = t + ' (V1 A4.10)'
for i, t in enumerate(S26): DERIVED[513 + i] = t + ' (register parking lot)'
NAMED = {395: 'Google Drive backup and restore drills (named in Prohori skill 04)',
         396: 'Restoring production: typed confirmation, staging first (named in Prohori skill 04)',
         407: 'Customer invoice (named in the register round-15 scope)',
         409: 'Invoice template editor — every word and block editable (named in Bhandari\'s files)',
         420: 'Approval gate for agent auto-fixes and new skills (named in the agent protocol)',
         423: 'Site health page with spike alerts (named in Prohori skill 08)',
         506: 'AI-off proof — the whole site works with AI off (named in the agent protocol)',
         507: 'Backup settings and restore drills, Google Drive (with PR 395)',
         568: 'Product and category sales by district and upazila (PENDING_CHANGES §60.14)'}
GENERIC_REF = {'S16': 'B3.8–B3.10', 'S18': 'B6, B7.5', 'S19': 'A1.5, A2', 'S20': 'B1.3–B2.4', 'S21': 'B7.3, B9',
               'S22': 'B4', 'S24': 'C7', 'S17': 'A4', 'S15': 'C1'}
AGENT = {k: v['en'] for k, v in RDATA['agents'].items()}
STATUS_MAP = {'built': 'Filed', 'demo': 'In demo', 'parked': 'Parked'}
ST_OVERRIDE = {2: 'Filed (verify only on the new VPS)', 70: 'Replaced → switch, off',
               596: 'In demo · **paused** (extensions)', 598: 'In demo (partial) · **paused**',
               599: 'In demo (partial) · **paused**', 600: 'Filed · **paused** (not in demo)'}
DEMO_OVERRIDE = {598: '`96d-site-builder.js` (#/admin/site)', 599: '`96d-site-builder.js` (#/admin/manual)',
                 70: '`02-core.js` (fab.whatsapp off)', 596: '`96c-layout-builder.js` (#/admin/side-canvas)'}

a_rows = []
derived_count = 0
for n in range(1, 601):
    s = pr_stage[n]
    if n in OVERRIDE:
        title = OVERRIDE[n]
    elif n in row_text:
        title = short_title(row_text[n])
    elif n in NAMED:
        title = NAMED[n] + ' *(derived)*'; derived_count += 1
    elif n in DERIVED:
        title = DERIVED[n] + ' *(derived)*'; derived_count += 1
    else:
        ref = GENERIC_REF.get(s, '')
        title = f'{stage_name[s]} — stage scope item, not itemised in the register (see {ref})' + ' *(derived)*'
        derived_count += 1
    p = RDATA['prs'][str(n)]
    st = ST_OVERRIDE.get(n, STATUS_MAP.get(p['st'], p['st']))
    own = ', '.join(AGENT.get(o, o) for o in p.get('own', []))
    demo = DEMO_OVERRIDE.get(n, '')
    if not demo and p.get('demo'):
        d = p['demo'][0]
        demo = (f'`{d["src"]}` ({d["h"]})' if d['src'] != 'hint' else f'{d["h"]} (route hint)')
    a_rows.append(f'| {n} | {title} | {s} | {st} | {own} | {demo} |')

APP_A = ('# Appendix A · Every PR, 1–600\n\n'
         'Generated from `master/MASTER-REGISTER.md` (title, stage) and the PR register data the demo builds from it '
         '(`proto/src/04-register-data.js`, written by `tools/make-register.py` after Note 45: status, owning agent, demo '
         'file). **Status:** *Filed* = specified in the register, built in the code phase · *In demo* = a working reference '
         'exists in the demo (the register generator\'s reading of demo source headers; "route hint" = matched by route only) · '
         '*Parked* = S26 handover pack · *paused* = finished in the code phase (status table at the top). '
         f'**{derived_count} titles are marked *(derived)*:** the register lists those PRs by range only; their titles '
         'come from V1\'s own item lists in order (positional, to be confirmed when the register is itemised), from '
         'agent files that name them, or from the stage\'s section of this specification.\n\n'
         '| PR | Title | Stage | Status | Owner | Demo reference |\n|---:|---|---|---|---|---|\n'
         + '\n'.join(a_rows) + '\n')

# ------------------------------------------------------------ Part E
E = N.E_PART.replace('STAGE_ROWS', stage_rows).replace('REACH_TABLE', reach_table)
v1e = body['E']
v1e = re.sub(r'^# Part E · Stages, the PR plan and the numbers\s*\n', '', v1e, flags=re.M)
v1e = re.sub(r'^### ', '#### ', v1e, flags=re.M)
v1e = re.sub(r'^## (E\d)\. ', r'### E-H.\1 (V1) ', v1e, flags=re.M)
partE_new = E + v1e

# ------------------------------------------------------------ front
def section(text, h):
    i = idx(text, h)
    m = re.search(r'^## ', text[i + 3:], re.M)
    j = i + 3 + m.start() if m else len(text)
    return text[i:j]

how = section(front, '## How to use this document')
what = section(front, '## What this platform is')
v1status = section(front, '## Status of each part')
inreview = v1status[v1status.index('**What "in review" means'):].strip().rstrip('-').strip()
v1contents = section(front, '## Contents')
v1head = front[:front.index('## Contents')]
v1record = ('### V1 front matter as of 18 October 2026 (superseded, kept for the record)\n\n'
            + re.sub(r'^# ', '#### ', v1head.strip(), flags=re.M) + '\n\n'
            + re.sub(r'^## ', '#### V1 ', v1contents.strip().rstrip('-').strip(), flags=re.M) + '\n\n'
            + re.sub(r'^## ', '#### V1 ', v1status[:v1status.index('**What "in review" means')].strip(), flags=re.M) + '\n')

bn = F.BN_SUMMARY.replace(
    '7. এরপর কী:',
    '7. পরে নতুন কিছু চাইলে: আপনি বলবেন বা ব্যাকএন্ডের ফর্মে লিখবেন। সেটা রেজিস্টারে ওঠে, একটা "পরিবর্তনের নোট" হয়, তারপর ব্লুপ্রিন্টের নতুন ভার্সন (V2.1, V2.2…) হয়। আপনাকে GitHub দেখতে হবে না।\n8. এরপর কী:')

front_new = (F.TITLE + '\n' + bn + '\n---\n\n## Contents\n\nCONTENTS_PLACEHOLDER\n\n---\n\n' + F.STATUS
             + '\n*V1 note kept (superseded by the table above):* ' + inreview + '\n\n---\n\n'
             + how.rstrip().rstrip('-').rstrip() + '\n\n' + F.HOW_TO_USE_V2 + '\n---\n\n'
             + what.rstrip().rstrip('-').rstrip() + '\n\n' + F.WHAT_V2 + '\n---\n\n'
             + F.CHANGELOG_TABLE + '\n' + F.NOTE_COVERAGE + '\n' + v1record + '\n---\n\n' + F.RESOLVED + '\n---\n\n'
             + F.RULINGS + '\n---\n\n' + F.CHANGE_PROCESS + '\n---\n\n')

# ------------------------------------------------------------ assemble
def before_last_rule(text):
    return text.rstrip().rstrip('-').rstrip() + '\n\n'

doc = (front_new
       + before_last_rule(body['A']) + N.A7 + '\n---\n\n'
       + partE_new.rstrip() + '\n\n---\n\n'
       + before_last_rule(body['B']) + N.B9 + '\n---\n\n'
       + before_last_rule(body['C']) + N.C10 + '\n' + N.C11 + '\n' + N.C12 + '\n' + N.C13 + '\n---\n\n'
       + before_last_rule(body['D']) + N.D8 + '\n' + N.D9 + '\n' + N.D10 + '\n' + N.D11 + '\n' + N.D12 + '\n---\n\n'
       + body['F'].rstrip() + '\n\n' + N.F4 + '\n---\n\n'
       + APP_A + '\n---\n\n' + N.APP_B + '\n---\n\n' + N.APP_C)

# contents from H1/H2 headings
heads = []
for line in doc.splitlines():
    if line.startswith('# ') and not line.startswith('# EXTAS'):
        heads.append('\n**' + line[2:].strip() + '**\n')
    elif line.startswith('## ') and line.strip() not in ('## Contents',):
        heads.append('- ' + line[3:].strip())
doc = doc.replace('CONTENTS_PLACEHOLDER', '\n'.join(heads).strip())

# final personal-data guard
for pat in [r'01[3-9]\d{8}', r'\+?8801\d{9}', r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}', r'mehadih32']:
    for m in re.finditer(pat, doc):
        ctx = doc[max(0, m.start() - 30):m.end() + 10].replace('\n', ' ')
        if 'orders@' in ctx:
            continue
        problems.append(f'personal-data pattern {pat}: …{ctx}…')

open(OUT, 'w', encoding='utf-8').write(doc)
print('written', OUT, len(doc.encode('utf-8')), 'bytes', doc.count('\n'), 'lines')
print('derived titles', derived_count)
print('PROBLEMS:' if problems else 'no problems')
for p in problems:
    print(' -', p)
