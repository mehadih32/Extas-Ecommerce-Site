#!/usr/bin/env python3
"""extract-admin-bn.py — Prohori A360-02 · PR 503 scope "Admin" (owner 19 Oct 19:53)

Finds every Bengali string the ADMIN screens can show, so the admin language
layer (src/98a-admin-lang.js) can turn it into simple English. Re-run it
whenever an admin file changes: it lists what the dictionary
(src/98b-admin-dict.js) does not cover yet.

How a string is found
  * JS is tokenised (comments are skipped; '…', "…", `…` and regex literals
    are understood).
  * A chain like  '<b>'+n+'টা লেখা</b> আজ'  is read as one piece of text with
    a placeholder for every expression between literals.  HTML tags are
    removed and the text between tags is one "segment" — exactly the text
    node the browser will hold.  Placeholders become {0}, {1} …
    An expression that clearly makes HTML (ico(), zs_pr(), a variable named
    *html* …) is treated as a tag boundary instead of a placeholder.
  * HTML entities and JS escapes are decoded, white space is collapsed.

usage (from the proto folder):
  python3 tools/extract-admin-bn.py                 # summary + missing count
  python3 tools/extract-admin-bn.py --missing out.json   # missing keys with file:line
  python3 tools/extract-admin-bn.py --all out.json       # every key with file:line
  python3 tools/extract-admin-bn.py --merge tr.json      # add translations {bn: en} to 98b
  python3 tools/extract-admin-bn.py --harvest            # use the files' own ['English','বাংলা'] pairs
Dictionary values: English text · '' = hide this line in English (it only repeats
the English label beside it) · '#keep' = never shown on screen, leave it.
"""
import glob, html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src')
DICT = os.path.join(SRC, '98b-admin-dict.js')

# the admin files (80–96c) + the admin parts of the shared files they call
def admin_files():
    fs = []
    for f in sorted(glob.glob(os.path.join(SRC, '*.js'))):
        b = os.path.basename(f)
        m = re.match(r'^(\d\d)', b)
        if not m: continue
        n = int(m.group(1))
        if 80 <= n <= 96 and b != '88-track.js': fs.append(f)
    # shared files whose strings show up inside the admin (sidebar, register data, help/settings texts)
    for b in ['03-layout.js', '04-register-data.js', '04b-docs-data.js']:
        p = os.path.join(SRC, b)
        if os.path.exists(p): fs.append(p)
    return fs

# generated data files: only their "bn" fields are screen labels (the rest is
# document text, which stays as the owner wrote it)
BN_FIELD_ONLY = {'04b-docs-data.js'}

BN = re.compile(r'[\u0980-\u09F2\u09F4-\u09FF]')   # Bengali script, but not the taka sign ৳ (used in English too)
PH = '\uE000'   # placeholder for a text expression
TB = '\uE001'   # tag boundary (an expression that makes HTML)
HTMLISH = re.compile(r'(\bico\(|zs_pr\(|_pr\(|html|Html|HTML|<|\bbtn|_sw\(|zs_sw|chip\(|badge|pill\(|\.join\(|\.map\(|_row\(|_card\(|_tag\(|_field\(|_head\(|_sec\(|svg|_img|_bar\(|_chart|_table|_tbl|_list\(|_rows\(|_li\(|tick\(|_note\(|_k\()')

def tokenize(src):
    """yield (kind, value, pos) — kind: str | tpl | op | other"""
    i, n = 0, len(src)
    prev_sig = ''   # last significant char/token for regex detection
    out = []
    while i < n:
        c = src[i]
        if c in ' \t\r\n':
            i += 1; continue
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"':
            j = i + 1; buf = []
            while j < n and src[j] != c:
                if src[j] == '\\' and j + 1 < n:
                    buf.append(src[j:j + 2]); j += 2; continue
                if src[j] == '\n': break
                buf.append(src[j]); j += 1
            out.append(('str', ''.join(buf), i)); i = j + 1; prev_sig = 'x'; continue
        if c == '`':
            j = i + 1; parts = []; buf = []
            while j < n and src[j] != '`':
                if src[j] == '\\' and j + 1 < n:
                    buf.append(src[j:j + 2]); j += 2; continue
                if src.startswith('${', j):
                    depth = 1; k = j + 2
                    while k < n and depth:
                        if src[k] == '{': depth += 1
                        elif src[k] == '}': depth -= 1
                        k += 1
                    expr = src[j + 2:k - 1]
                    buf.append(TB if HTMLISH.search(expr) else PH); j = k; continue
                buf.append(src[j]); j += 1
            out.append(('str', ''.join(buf), i)); i = j + 1; prev_sig = 'x'; continue
        if c == '/':
            # regex literal?
            if prev_sig in ('', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof'):
                j = i + 1; cls = False
                while j < n:
                    ch = src[j]
                    if ch == '\\': j += 2; continue
                    if ch == '[': cls = True
                    elif ch == ']': cls = False
                    elif ch == '/' and not cls: break
                    elif ch == '\n': break
                    j += 1
                j += 1
                while j < n and src[j].isalpha(): j += 1
                out.append(('other', src[i:j], i)); i = j; prev_sig = 'x'; continue
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (src[j].isalnum() or src[j] in '_$'): j += 1
            w = src[i:j]
            out.append(('other', w, i)); i = j
            prev_sig = w if w in ('return', 'typeof') else 'x'; continue
        out.append(('op', c, i)); i += 1
        prev_sig = c if c not in ')]' else 'x'
    return out

def unescape_js(s):
    def rep(m):
        e = m.group(1)
        if e[0] == 'u':
            if e[1] == '{': return chr(int(e[2:-1], 16))
            return chr(int(e[1:], 16))
        if e[0] == 'x': return chr(int(e[1:], 16))
        return {'n': '\n', 't': '\t', 'r': '', 'b': '', 'f': '', 'v': '', '0': ''}.get(e, e)
    return re.sub(r'\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)', rep, s, flags=re.S)

def chains(toks, src):
    """group str tokens joined by + (with expressions in between) into chains"""
    res = []; used = set()
    i, n = 0, len(toks)
    while i < n:
        if toks[i][0] != 'str' or i in used: i += 1; continue
        pieces = [unescape_js(toks[i][1])]; pos = toks[i][2]; j = i + 1
        # an expression right before:  n+'টা লেখা'  → '{0}টা লেখা'
        if i >= 2 and toks[i - 1][0] == 'op' and toks[i - 1][1] == '+' and toks[i - 2][0] != 'str' and not (toks[i - 2][0] == 'op' and toks[i - 2][1] not in ')]'):
            m = i - 2; depth = 0
            while m >= 0:
                t = toks[m]
                if t[0] == 'op' and t[1] in ')]': depth += 1
                elif t[0] == 'op' and t[1] in '([':
                    if depth == 0: break
                    depth -= 1
                elif depth == 0 and t[0] == 'op' and t[1] != '.': break
                elif depth == 0 and t[0] == 'str': break
                elif depth == 0 and t[0] == 'other' and t[1] in ('return', 'var', 'typeof', 'case', 'else'): break
                m -= 1
            expr = src[toks[m + 1][2]:toks[i - 1][2]] if m + 1 <= i - 2 else ''
            if expr.strip():
                pieces.insert(0, TB if HTMLISH.search(expr) else PH)
        while j < n and toks[j] == ('op', '+', toks[j][2]):
            k = j + 1
            if k < n and toks[k][0] == 'str':
                pieces.append(unescape_js(toks[k][1])); used.add(k); j = k + 1; continue
            # expression up to a top-level + followed by a string
            depth = 0; m = k; found = -1
            while m < n:
                t = toks[m]
                if t[0] == 'op':
                    if t[1] in '([{': depth += 1
                    elif t[1] in ')]}':
                        if depth == 0: break
                        depth -= 1
                    elif depth == 0 and t[1] in ',;:?': break
                    elif depth == 0 and t[1] == '+':
                        if m + 1 < n and toks[m + 1][0] == 'str': found = m; break
                if t[0] == 'other' and depth == 0 and t[1] in ('return', 'var', 'if', 'function'): break
                m += 1
            if found < 0:
                # the chain ends with an expression ('ডেমোতে '+n): keep it as a placeholder
                if m > k:
                    end = toks[m][2] if m < n else len(src)
                    expr = src[toks[k][2]:end]
                    pieces.append(TB if HTMLISH.search(expr) else PH)
                break
            expr = src[toks[k][2]:toks[found][2]]
            pieces.append(TB if HTMLISH.search(expr) else PH)
            pieces.append(unescape_js(toks[found + 1][1])); used.add(found + 1); j = found + 2
        res.append((''.join(pieces), pos)); i += 1   # literals inside the expressions are read on their own too
    return res

# a Bengali run: starts and ends on a Bengali character (the runtime uses the same rule)
RUN = re.compile(r'[\u0980-\u09F2\u09F4-\u09FF](?:[\u0980-\u09F2\u09F4-\u09FF\s,;:!?\-\u2013\u2014/+%0-9.]*[\u0980-\u09F2\u09F4-\u09FF])?')
LATIN = re.compile(r'[A-Za-z]')
def mostly_latin(seg):
    # long English text (register PR lines) with a Bengali name inside: only the Bengali bits are keys
    return len(seg) > 100 and len(LATIN.findall(seg)) > len(BN.findall(seg))

TAG = re.compile(r'<(?:[a-zA-Z/!][^<>]*)>')
LETTER = re.compile(r'[\u0980-\u09E5\u09F0-\u09F2\u09F4-\u09FF]')   # Bengali letters (digits alone are turned into 0–9 by the layer)
ATTR = re.compile(r'(?:placeholder|title|aria-label|alt|value|data-confirm)=\\?"([^"<>]*)"')
def segments(text):
    # Bengali inside attributes the layer translates (placeholder, title, aria-label, button value)
    for m in ATTR.finditer(text):
        a = m.group(1)
        if BN.search(a):
            for key in segments(a.replace(TB, PH)): yield key
    t = TAG.sub(TB, text)
    # a line break inside the text (Telegram / SMS previews) is its own boundary — the layer translates line by line
    for seg in re.split(TB + '|\n|<br\\s*/?>', t):
        if not BN.search(seg): continue
        seg = html.unescape(seg)
        seg = re.sub(r'\s+', ' ', seg).strip()
        if not seg or not LETTER.search(seg): continue
        # number the placeholders
        k = [0]
        def num(_):
            v = '{%d}' % k[0]; k[0] += 1; return v
        if mostly_latin(seg):
            # English text with a Bengali name or phrase inside: only the Bengali bits are keys
            for r in RUN.findall(seg.replace(PH, ' ')):
                if LETTER.search(r): yield r.strip()
            continue
        key = re.sub(PH, num, seg)
        yield key

def line_of(src, pos):
    return src.count('\n', 0, pos) + 1

CONTENT_FIELDS = [('73-blog.js', 'title')]

# Shop files (not admin files) that add rows to Admin › Settings (ZS_SETTINGS.push): the
# 15 lines up to each push are read too — those rows show on #/admin/settings.
def settings_extra():
    out = []
    names = {os.path.basename(f) for f in admin_files()}
    for f in sorted(glob.glob(os.path.join(SRC, '*.js'))):
        b = os.path.basename(f)
        if b in names or b.startswith('98'): continue
        src = open(f, encoding='utf-8').read()
        if 'ZS_SETTINGS.push' not in src: continue
        lines = src.split('\n')
        for i, l in enumerate(lines):
            if 'ZS_SETTINGS.push' in l:
                out.append((f, '\n'.join(lines[max(0, i - 15):i + 1]), max(0, i - 15)))
    return out

def extract():
    found = {}   # key -> [file:line,...]
    for f in admin_files():
        src = open(f, encoding='utf-8').read()
        if os.path.basename(f) in BN_FIELD_ONLY:
            for m in re.finditer(r'"bn":\s*"((?:[^"\\]|\\.)*)"', src):
                for key in segments(json.loads('"' + m.group(1) + '"')):
                    found.setdefault(key, []).append('%s:%d' % (os.path.basename(f), line_of(src, m.start())))
            continue
        toks = tokenize(src)
        for text, pos in chains(toks, src):
            if not BN.search(text): continue
            for key in segments(text):
                found.setdefault(key, []).append('%s:%d' % (os.path.basename(f), line_of(src, pos)))
    # Bengali blog posts in the shop's journal: their titles are listed in the admin (Blog & SEO)
    for b, field in CONTENT_FIELDS:
        f = os.path.join(SRC, b)
        if not os.path.exists(f): continue
        src = open(f, encoding='utf-8').read()
        for m in re.finditer(r'\b' + field + r"\s*:\s*'((?:[^'\\\n]|\\.)*)'", src):
            for key in segments(unescape_js(m.group(1))):
                found.setdefault(key, []).append('%s:%d' % (b, line_of(src, m.start())))
    for f, chunk, l0 in settings_extra():
        toks = tokenize(chunk)
        for text, pos in chains(toks, chunk):
            if not BN.search(text): continue
            for key in segments(text):
                found.setdefault(key, []).append('%s:%d' % (os.path.basename(f), l0 + line_of(chunk, pos)))
    return found

# ---- authored pairs: the admin files already say some things in both languages ----
#   ['English', 'বাংলা'] two-string arrays, {en:'…', bn:'…'}, {descEn:'…', desc:'…'}
# The author's own English is used for those Bengali strings (--harvest), so a Bengali hint that only
# repeats its English label becomes identical to it and the layer hides the copy.
def harvest():
    pairs = {}
    S = r"'((?:[^'\\\n]|\\.)*)'"
    def add(en, bn):
        en, bn = unescape_js(en), unescape_js(bn)
        if '<' in en or '<' in bn: return
        if not LETTER.search(bn) or BN.search(en) or not LATIN.search(en): return
        if PH in en or "'+" in en: return
        # a code value, not words: 'ok', 'banner', 'AddToCart', 'L'
        if len(en) < 2 or re.match(r'^[a-z][\w-]*$', en) or re.match(r'^([A-Z][a-z]+){2,}$', en): return
        for kb in segments(bn):
            if '{' in kb and '{' not in en: continue
            pairs.setdefault(kb, en.strip())
    for f in admin_files():
        if os.path.basename(f) in BN_FIELD_ONLY: continue
        src = open(f, encoding='utf-8').read()
        for m in re.finditer(r'\[\s*' + S + r'\s*,\s*' + S + r'\s*\]', src):
            a, b = m.group(1), m.group(2)
            # only ['English words', 'বাংলা'] — [বাংলা, x] arrays are often (finding, source), and a single
            # word first is often a code (['Purchase', 'অর্ডার'] is an event name, not a translation)
            if LETTER.search(b) and ' ' in a.strip(): add(a, b)
        for m in re.finditer(r'\ben\s*:\s*' + S + r'[^{}\n]*?\bbn\s*:\s*' + S, src): add(m.group(1), m.group(2))
        for m in re.finditer(r'\bbn\s*:\s*' + S + r'[^{}\n]*?\ben\s*:\s*' + S, src): add(m.group(2), m.group(1))
        for m in re.finditer(r'\bdesc\s*:\s*' + S + r'[^{}\n]*?\bdescEn\s*:\s*' + S, src): add(m.group(2), m.group(1))
    # [id, 'English words', 'বাংলা'] rows, e.g. the settings rows other files add
    for f, src in [(f, open(f, encoding='utf-8').read()) for f in admin_files() if os.path.basename(f) not in BN_FIELD_ONLY] + [(f, c) for f, c, l0 in settings_extra()]:
        for m in re.finditer(r',\s*' + S + r'\s*,\s*' + S + r'\s*\]', src):
            a, b = m.group(1), m.group(2)
            if LETTER.search(b) and ' ' in a.strip(): add(a, b)
    return pairs

# Names the admin shows in Bengali (categories, agents, writers): {name:'Polos', bn:'পোলো'} in the
# data and admin files — and their first letters, since avatars show the Bengali name's first letter.
NAME_FILES = sorted(os.path.basename(f) for f in glob.glob(os.path.join(SRC, '0*.js')) if not re.match(r'0(4b|5|6)-', os.path.basename(f)))
def names():
    out, first, clash = {}, {}, set()
    S = r"'((?:[^'\\\n]|\\.)*)'"
    files = [os.path.join(SRC, b) for b in NAME_FILES] + [f for f in admin_files() if os.path.basename(f) not in BN_FIELD_ONLY]
    for f in files:
        if not os.path.exists(f): continue
        src = open(f, encoding='utf-8').read()
        for m in re.finditer(r'\b(name|en)\s*:\s*' + S + r'\s*,\s*bn\s*:\s*' + S, src):
            en, bn = unescape_js(m.group(2)).strip(), unescape_js(m.group(3)).strip()
            if not LETTER.search(bn) or BN.search(en) or not LATIN.search(en): continue
            if m.group(1) == 'en' and (' ' in en or not en[0].isupper()): continue   # en: one capitalised word = a name
            if m.group(1) == 'name': out[bn] = en       # a proper name (writer 'যত্ন' is Jotno, not "care")
            else: out.setdefault(bn, en)
            if ' ' in bn: continue
            a, b = bn[0], en[0].upper()
            if a in first and first[a] != b: clash.add(a)
            first.setdefault(a, b)
    for a, b in first.items():
        if a not in clash: out.setdefault(a, b)
    return out

def load_dict():
    if not os.path.exists(DICT): return {}
    s = open(DICT, encoding='utf-8').read()
    m = re.search(r'/\*DICT-START\*/(.*)/\*DICT-END\*/', s, re.S)
    if not m: return {}
    return json.loads('{' + m.group(1).strip().rstrip(',') + '}')

def write_dict(d):
    s = open(DICT, encoding='utf-8').read()
    body = ',\n'.join('  ' + json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) for k, v in sorted(d.items()))
    s = re.sub(r'/\*DICT-START\*/.*/\*DICT-END\*/', lambda m: '/*DICT-START*/\n' + body + '\n/*DICT-END*/', s, flags=re.S)
    open(DICT, 'w', encoding='utf-8').write(s)

def main(argv):
    found = extract(); d = load_dict()
    if '--harvest' in argv:
        h = harvest(); n = 0
        for k, v in h.items():
            if k in found and d.get(k) != v: d[k] = v; n += 1
        for k, v in names().items():          # names win: added even when no admin file spells them out
            if d.get(k) != v: d[k] = v; n += 1
        write_dict(d); print('harvested', len(h), 'authored pairs ·', n, 'dictionary entries set from them'); return
    if '--merge' in argv:
        add = json.load(open(argv[argv.index('--merge') + 1], encoding='utf-8'))
        bad = [k for k, v in add.items() if not isinstance(v, str) or (BN.search(v) and v != '#keep')]
        for k in bad: print('  not merged (Bengali left in English):', k, '→', add[k])
        for k, v in add.items():
            if k not in bad: d[k] = v
        write_dict(d); print('merged', len(add) - len(bad), '→', len(d), 'entries'); return
    missing = {k: v for k, v in found.items() if k not in d}
    print('admin files:', len(admin_files()), '· Bengali strings found:', len(found), '· in dictionary:', len(found) - len(missing), '· missing:', len(missing), '· dictionary size:', len(d))
    if '--missing' in argv:
        json.dump(missing, open(argv[argv.index('--missing') + 1], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    if '--all' in argv:
        json.dump(found, open(argv[argv.index('--all') + 1], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

if __name__ == '__main__':
    main(sys.argv[1:])
