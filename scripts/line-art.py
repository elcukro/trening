"""Rysunek kreską z fal.ai (czarny tusz na białym, scratch/fal-raw/<id>.png) → PNG z przezroczystością do public/m/wait/.

Alfa z jasności (biel = przezroczyste, czerń = kryjące), kolor zawsze czarny – kreska jest ostra na Retinie i można
ją przyciemnić/rozjaśnić w CSS. Przycięcie do treści z marginesem, zmniejszenie do podanej szerokości (≈ 3× rozmiaru
na ekranie). Użycie: python3 -I scripts/line-art.py <id> <szerokość_px>
"""
import sys
from PIL import Image, ImageOps

src, width = sys.argv[1], int(sys.argv[2])
img = ImageOps.grayscale(Image.open(f"scratch/fal-raw/{src}.png"))
# poziomy: tło (≥ 225) całkiem przezroczyste, kreska (≤ 70) całkiem kryjąca – bez szarej mgiełki z kompresji
alpha = img.point(lambda v: 0 if v >= 225 else 255 if v <= 70 else int((225 - v) * 255 / 155))
box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
pad = 8
box = (max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, img.width), min(box[3] + pad, img.height))
alpha = alpha.crop(box)
h = round(alpha.height * width / alpha.width)
alpha = alpha.resize((width, h), Image.LANCZOS)
out = Image.new("LA", alpha.size, 0)
out.putalpha(alpha)
out.save(f"public/m/wait/{src}.png", optimize=True)
print(f"{src}: {width}×{h}")
