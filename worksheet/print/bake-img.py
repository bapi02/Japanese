#!/usr/bin/env python3
"""삽화를 표시 크기 비율로 자르고, 가장자리 흰색 번짐을 픽셀에 직접 구워 넣는다 (PDF 투명 마스크를 쓰지 않기 위해).
사용: bake-img.py <src> <dst.jpg> <표시 가로px> <표시 세로px> <번짐px>"""
import sys
from PIL import Image, ImageDraw, ImageFilter
src, dst, w, h, fade = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src).convert('RGB')
sw, sh = im.size
# cover 방식 가운데 자르기
if sw / sh > w / h:
    nw = round(sh * w / h); box = ((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh)
else:
    nh = round(sw * h / w); box = (0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh)
im = im.crop(box)
scale = min(2.5, im.size[0] / w)            # 원본 해상도를 넘지 않는 선에서 최대 2.5배
ow, oh = max(1, round(w * scale)), max(1, round(h * scale))
im = im.resize((ow, oh), Image.LANCZOS)
f = max(2, round(fade * scale))
mask = Image.new('L', (ow, oh), 0)
ImageDraw.Draw(mask).rectangle((f, f, ow - f - 1, oh - f - 1), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(f * 0.62))
out = Image.composite(im, Image.new('RGB', (ow, oh), 'white'), mask)
out.save(dst, quality=90)
