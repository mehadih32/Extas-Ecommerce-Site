# -*- coding: utf-8 -*-
"""Verify EXTAS-ECOMMERCE-V2.md against the register, ROUND15 and V1."""
import re, sys
BP = '/home/claude/blueprint'
V2 = open(f'{BP}/EXTAS-ECOMMERCE-V2.md', encoding='utf-8').read()
V1 = open(f'{BP}/EXTAS-ECOMMERCE-V1.md', encoding='utf-8').read()
REG = open(f'{BP}/master/MASTER-REGISTER.md', encoding='utf-8').read()
R15 = open(f'{BP}/review/ROUND15.md', encoding='utf-8').read()
ok = True
def res(name, good, detail=''):
    global ok
    ok = ok and good
    print(('PASS ' if good else 'FAIL ') + name + (': ' + detail if detail else ''))

# 1. every PR 1-600 in V2, and as an Appendix A row
appA = V2[V2.index('# Appendix A'):V2.index('# Appendix B')]
rows = {int(m.group(1)): m.group(0) for m in re.finditer(r'^\| (\d+) \| .*$', appA, re.M)}
missing_rows = [n for n in range(1, 601) if n not in rows]
res('Appendix A has a row for every PR 1-600', not missing_rows and len(rows) == 600,
    f'{len(rows)} rows, missing {missing_rows[:10]}')
missing_any = [n for n in range(1, 601) if not re.search(r'(?<![\d.,])%d(?![\d])' % n, V2)]
res('every PR number 1-600 appears in V2', not missing_any, f'missing {missing_any[:10]}')

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
res('stage totals', total(reg) == total(v2t) == 600, f'register {total(reg)}, V2 {total(v2t)}')
tot_line = re.search(r'^\| \| \*\*Total\*\* \| \*\*(\d+)\*\*', V2[V2.index('## E0.'):], re.M)
res('E0 total line reads 600', bool(tot_line) and tot_line.group(1) == '600')
nums = []
for c, rng in reg.values():
    for part in rng.split(','):
        part = part.strip()
        if not part or part == '—': continue
        if '–' in part:
            a, b = map(int, part.split('–')); nums += range(a, b + 1)
        else:
            nums.append(int(part))
res('register ranges cover 1-600 exactly once', sorted(nums) == list(range(1, 601)),
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
res('every V1 line carried into V2 (tagged or verbatim)', len(missing) == 0,
    f"{len(missing)} V1 lines not found verbatim: " + " || ".join(m[:90] for m in missing))

# 5. personal data
pd = re.findall(r'01[3-9]\d{8}|\+?8801\d{9}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|mehadih32', V2)
res('no phone numbers / e-mails / personal repo names', not pd, str(pd[:5]))

# 6. paused items marked
for n in (596, 598, 599, 600):
    res(f'PR {n} marked paused in Appendix A', 'paused' in rows[n])
print('\nOVERALL:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
