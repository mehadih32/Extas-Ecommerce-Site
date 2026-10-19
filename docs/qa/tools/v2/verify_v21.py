# -*- coding: utf-8 -*-
"""Verify EXTAS-ECOMMERCE-V2.1.md (V2 + change note CN-001, owner server spec 19 Oct 23:33; CN-002 20 Oct 00:45;
V2.1 final 20 Oct — last update before code) against the register, ROUND15 (Notes 1-49), V1 and V2.
Adapted from verify_v2.py."""
import json
import re, sys
BP = '/home/claude/blueprint'
V2 = open(f'{BP}/EXTAS-ECOMMERCE-V2.1.md', encoding='utf-8').read()   # the file under test (V2.1)
V20 = open(f'{BP}/EXTAS-ECOMMERCE-V2.md', encoding='utf-8').read()  # V2 as history
N = 604
NOTES = 49   # V2.1 final · 20 Oct: Note 49 (VM created, CN-002)
V1 = open(f'{BP}/EXTAS-ECOMMERCE-V1.md', encoding='utf-8').read()
REG = open(f'{BP}/master/MASTER-REGISTER.md', encoding='utf-8').read()
R15 = open(f'{BP}/review/ROUND15.md', encoding='utf-8').read()
ok = True
def res(name, good, detail=''):
    global ok
    ok = ok and good
    print(('PASS ' if good else 'FAIL ') + name + (': ' + detail if detail else ''))

# 1. every PR 1-N in V2.1, and as an Appendix A row
appA = V2[V2.index('# Appendix A'):V2.index('# Appendix B')]
rows = {int(m.group(1)): m.group(0) for m in re.finditer(r'^\| (\d+) \| .*$', appA, re.M)}
missing_rows = [n for n in range(1, N + 1) if n not in rows]
res(f'Appendix A has a row for every PR 1-{N}', not missing_rows and len(rows) == N,
    f'{len(rows)} rows, missing {missing_rows[:10]}')
missing_any = [n for n in range(1, N + 1) if not re.search(r'(?<![\d.,])%d(?![\d])' % n, V2)]
res(f'every PR number 1-{N} appears in V2.1', not missing_any, f'missing {missing_any[:10]}')

# 2. owner notes
notes = sorted({int(n) for n in re.findall(r'^## Note (\d+)', R15, re.M)})
cov = V2[V2.index('### Round 15 notes'):V2.index('## Resolved conflicts')]
unref = []
nochange = []
for n in notes:
    refs = len(re.findall(r'\bNote %d(?![\d])' % n, V2))
    row = re.search(r'^\| Note %d \|.*$' % n, cov, re.M)
    if refs == 0:
        unref.append(n)
    if row and 'no spec change' in row.group(0):
        nochange.append(n)
res(f'every ROUND15 note 1-{max(notes)} referenced (or marked no spec change)', not unref,
    f'{len(notes)} notes; unreferenced {unref}; rows marking (part) no spec change: {nochange}')
cov_missing = [n for n in notes if not re.search(r'^\| Note %d \|' % n, cov, re.M)]
res(f'ROUND15 has Notes 1-{NOTES} exactly', notes == list(range(1, NOTES + 1)), f'found {notes[:3]}…{notes[-3:]}')
res('note coverage table has a row per note', not cov_missing, f'missing {cov_missing}')

# 3. stage table vs register
def stage_table(text, start, end):
    t = text[text.index(start):]
    t = t[:t.index(end)] if end in t else t
    out = {}
    for line in t.splitlines():
        m = re.match(r'\| (S\w+) \| .+? \| (\S+) \| (.*?) \|', line)
        if m:
            out[m.group(1)] = (m.group(2), m.group(3).strip())
    return out
reg = stage_table(REG, '## The stage table', '### How this reached')
v2t = stage_table(V2, '## E0. The stage table', '## E1.')
diff = [s for s in reg if reg[s] != v2t.get(s)] + [s for s in v2t if s not in reg]
res('E0 stage rows match the register (count and range)', not diff and len(reg) == len(v2t) == 29,
    f'{len(reg)} register rows, {len(v2t)} V2 rows, differing {diff}')
def total(t):
    return sum(int(c) for c, _ in t.values() if c.isdigit())
res('stage totals', total(reg) == total(v2t) == N, f'register {total(reg)}, V2.1 {total(v2t)}')
tot_line = re.search(r'^\| \| \*\*Total\*\* \| \*\*(\d+)\*\*', V2[V2.index('## E0.'):], re.M)
res(f'E0 total line reads {N}', bool(tot_line) and tot_line.group(1) == str(N))
nums = []
for c, rng in reg.values():
    for part in rng.split(','):
        part = part.strip()
        if not part or part == '—': continue
        if '–' in part:
            a, b = map(int, part.split('–')); nums += range(a, b + 1)
        else:
            nums.append(int(part))
res(f'register ranges cover 1-{N} exactly once', sorted(nums) == list(range(1, N + 1)),
    f'{len(nums)} numbers, {len(set(nums))} distinct')
# Appendix A stage column agrees with the ranges
stage_of = {}
for s, (c, rng) in reg.items():
    for part in rng.split(','):
        part = part.strip()
        if not part or part == '—': continue
        if '–' in part:
            a, b = map(int, part.split('–'))
            for n in range(a, b + 1): stage_of[n] = s
        else:
            stage_of[int(part)] = s
bad = [n for n, r in rows.items() if r.split(' | ')[2].strip() != stage_of[n]]
res('Appendix A stage column matches the register', not bad, f'mismatches {bad[:10]}')

# 4. nothing from V1 silently dropped: every V1 line present in V2 (after the personal-data scrub),
#    except lines intentionally rewritten (listed)
scrub = [('`mehadih32/Extas-ERP`', "the owner's ERP repository (`Extas-ERP`)"),
         ('mehadih32/Extas-ERP', "the owner's ERP repository (Extas-ERP)"), ('01811223344', '01XXXXXXXXX')]
for a, b in scrub:
    V1 = V1.replace(a, b)
sys.path.insert(0, '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/v2')
import content_inserts as I
inplace_old = [o for o, _ in I.INPLACE]
intentional = []
v2lines = set(l.strip() for l in V2.splitlines())
v2flat = re.sub(r'\s+', ' ', V2)
missing = []
for l in V1.splitlines():
    s = l.strip()
    if not s or s == '---' or s in v2lines:
        continue
    core = re.sub(r'^[#>*\-\d.\s|]+', '', s)[:60]
    if core and core in v2flat:
        continue          # present with a tag / prefix / demoted heading
    if any(s in o or o.split('\n')[0] in s for o in inplace_old) or re.match(r'^## E\d\. ', s) or s.startswith('# Part E'):
        intentional.append(s); continue
    missing.append(s)
print(f'INFO {len(intentional)} V1 lines intentionally rewritten in place (tagged "[Replaced …]" / renamed E-H headings):')
for x in intentional: print('     -', x[:110])
res('every V1 line carried into V2.1 (tagged or verbatim)', len(missing) == 0,
    f"{len(missing)} V1 lines not found verbatim: " + " || ".join(m[:90] for m in missing))

# 4b. nothing from V2 silently dropped: every V2 line present in V2.1 (verbatim / with a tag), or one of the
#     in-place replacements recorded by build_v21.py (cn001-inplace.json, each shown with its new text in V2.1)
CN = json.load(open('/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/cn001/cn001-inplace.json', encoding='utf-8'))
v21lines = set(l.strip() for l in V2.splitlines())
miss2, inten2 = [], []
# V2.1 final (20 Oct) in-place changes: old V2 line start -> the struck-through old text that must stand in V2.1
FINAL_INPLACE = {'(L28, L29). Marks: ✅ pass': '~~(L28, L29)~~ **(L32, L33'}
final_seen = set()
for l in V20.splitlines():
    s = l.strip()
    if not s or s == '---' or s in v21lines:
        continue
    core = re.sub(r'^[#>*\-\d.\s|]+', '', s)[:60]
    if core and core in v2flat:
        continue
    if any(s in o or (len(o.split('\n')[0]) > 30 and o.split('\n')[0] in s) for o in CN):
        inten2.append(s); continue
    fin = [f for f in FINAL_INPLACE if s.startswith(f)]
    if fin:
        final_seen.update(fin); inten2.append(s); continue
    miss2.append(s)
print(f'INFO {len(inten2)} V2 lines changed in place by CN-001 or V2.1 final (old text struck through / superseded in V2.1):')
for x in inten2: print('     -', x[:110])
res('every V2 line carried into V2.1 (verbatim, tagged, or a recorded CN-001 change)', not miss2,
    f"{len(miss2)} V2 lines missing: " + " || ".join(m[:90] for m in miss2[:8]))
res('V2.1 final in-place changes each keep the old text struck through',
    all(FINAL_INPLACE[f] in V2 for f in final_seen) and final_seen == set(FINAL_INPLACE),
    f'recorded {sorted(final_seen)}')
res('V2.md itself untouched by CN-001 (still says 600 PRs)', 'Version 2.0 · 19 October 2026' in V20 and '# Appendix A · Every PR, 1–600' in V20)

# 4c. register header and CN-001 markers
hm = re.search(r'\*\*(\d+) PRs · (\d+) stages', REG)
res(f'register header reads {N} PRs · 28 stages', bool(hm) and hm.group(1) == str(N) and hm.group(2) == '28')
res('register "How this reached" ends at the CN-001 row', bool(re.search(r'CN-001\) \| \+4 \| \*\*%d\*\*' % N, REG)))
for n in (601, 602, 603, 604):
    res(f'PR {n} has its own register row and an Appendix A row', bool(re.search(r'^\| %d \| \*\*' % n, REG, re.M)) and n in rows)
upd = [n for n in (1, 3, 4, 5, 6, 7, 8, 9, 10, 13, 18, 22, 24, 37, 72, 88, 234, 519)
       if not re.search(r'^\| %d \| .*Updated 19 Oct 23:33 \(owner server spec\)' % n, REG, re.M)]
res('dated scope "Updated 19 Oct 23:33 (owner server spec)" on every updated register row', not upd, f'missing on {upd}')
res('range-only PRs 362, 395, 423, 507 carry scope in the 23:33 scope block',
    all(re.search(r'^- \*\*PR %s' % k, REG, re.M) for k in ('362', '395 / 507', '423')))
for need in ('## V2.1-এ কী বদলেছে', 'CN-001', '### A2.9 Server specification', 'E8ds_v6', '1 TB (1024 GiB)', 'Meilisearch (site search) | 4 GB'):
    res(f'V2.1 contains "{need}"', need in V2)

# 4d. V2.1 final (20 Oct) markers — strict
unstruck = [m.start() for m in re.finditer(r'L28, L29', V2) if not re.search(r'~~[^~\n]*L28, L29[^~\n]*~~', V2[max(0, m.start() - 40):m.end() + 40])]
res('no unstruck "L28, L29" timing reference left (now L32/L33)', not unstruck, f'{len(unstruck)} unstruck')
for need in ('### V2.1 চূড়ান্ত (২০ অক্টোবর)', 'এই ফাইল থেকেই কোড শুরু হবে', '### V2.1 final change log (20 Oct 2026)',
             '#### A2.9.18 Server admin pages in the demo', '| 2.1 final | 2026-10-20 |', 'BAG_TIER_SEED', '**L32, L33**'):
    res(f'V2.1 final contains "{need}"', need in V2)
b4 = V2[V2.index('## B.4 Open owner decisions'):V2.index('# Appendix C')]
res('Appendix B.4 #13 = 4-piece tier prices (owner yes)', bool(re.search(r'^\| 13 \| .*৳2,700.*৳1,750', b4, re.M)))
fin_n = V2.count('V2.1 final · 20 Oct')
res('items marked "V2.1 final · 20 Oct" (≥ 20)', fin_n >= 20, f'{fin_n} marks')
for r_ in ('#/admin/server', '#/admin/cache', '#/admin/images', '#/admin/speed', '#/admin/integrations', '#/admin/backup'):
    res(f'A2.9.18 lists {r_}', r_ in V2[V2.index('#### A2.9.18'):V2.index('## A3.')])
res('ROUND15 has the "Done — V2.1 final" block', '### Done — V2.1 final' in R15)
res('register carries dated scope "V2.1 final · 20 Oct" on PR 42, 98, 107, 109, 503, 598',
    all(re.search(r'^\| %d \| .*V2\.1 final · 20 Oct' % n, REG, re.M) for n in (42, 98, 107, 109, 503, 598)))

# 5. personal data
pd = re.findall(r'01[3-9]\d{8}|\+?8801\d{9}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|mehadih32|\b(?:\d{1,3}\.){3}\d{1,3}\b|BEGIN [A-Z ]*PRIVATE KEY|ssh-(?:rsa|ed25519) AAAA', V2)
res('no phone numbers / e-mails / personal repo names / IPs / keys', not pd, str(pd[:5]))

# 6. paused items marked
for n in (596, 598, 599, 600):
    res(f'PR {n} marked paused in Appendix A', 'paused' in rows[n])
print('\nOVERALL:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
