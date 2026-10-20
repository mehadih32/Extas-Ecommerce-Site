import sys
from PIL import Image, ImageChops
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
w=min(a.size[0],b.size[0]); h=min(a.size[1],b.size[1])
# first differing row from top, and from bottom (aligned at bottom)
def rows(x,y,hh):
    d=ImageChops.difference(x.crop((0,0,w,hh)), y.crop((0,0,w,hh))).getbbox(); return d
top=ImageChops.difference(a.crop((0,0,w,h)), b.crop((0,0,w,h))).getbbox()
ab=a.crop((0,a.size[1]-h,w,a.size[1])); bb=b.crop((0,b.size[1]-h,w,b.size[1]))
bot=ImageChops.difference(ab,bb).getbbox()
print(sys.argv[1].split('/')[-1], 'top-aligned first diff y=', top and top[1], '| bottom-aligned diff rows', bot and (bot[1]+a.size[1]-h, bot[3]+a.size[1]-h), 'of', a.size[1])
