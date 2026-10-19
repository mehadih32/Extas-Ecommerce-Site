# usage: python3 rep.py <file> <edits.py>   edits.py defines E = [(old,new[,count]), ...]
import sys
p=sys.argv[1]; s=open(p).read(); ns={}; exec(open(sys.argv[2]).read(), ns)
for e in ns['E']:
    old,new=e[0],e[1]; cnt=e[2] if len(e)>2 else 1
    n=s.count(old)
    if n!=cnt: sys.exit('FAIL count %d (want %d) for: %r'%(n,cnt,old[:120]))
    s=s.replace(old,new)
open(p,'w').write(s); print('ok', p, len(ns['E']), 'edits')
