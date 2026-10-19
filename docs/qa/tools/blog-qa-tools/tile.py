import sys
from PIL import Image
src, out, ch, cols = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
start = int(sys.argv[5]) if len(sys.argv) > 5 else 0
im = Image.open(src); w, h = im.size
parts = [im.crop((0, y, w, min(h, y + ch))) for y in range(start, h, ch)][:cols]
T = Image.new('RGB', (w * len(parts) + 10 * (len(parts) - 1), ch), 'white')
for i, p in enumerate(parts): T.paste(p, (i * (w + 10), 0))
T.save(out); print(out, T.size, 'covers', start, '→', min(h, start + ch * cols), 'of', h)
