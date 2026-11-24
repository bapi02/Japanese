#!/usr/bin/env python3
"""PDF 페이지 상자를 정확한 mm 크기로 맞춘다 (브라우저 출력의 픽셀 반올림 오차 제거).
사용: exact-size.py <pdf> <가로mm> <세로mm>   — 왼쪽·위 기준으로 남는 오른쪽·아래를 잘라냄"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
f, w, h = sys.argv[1], float(sys.argv[2]) * 72 / 25.4, float(sys.argv[3]) * 72 / 25.4
r = PdfReader(f); out = PdfWriter()
for p in r.pages:
    H = float(p.mediabox.height)
    box = RectangleObject([0, H - h, w, H])
    for b in ('mediabox', 'cropbox', 'trimbox', 'bleedbox', 'artbox'): setattr(p, b, box)
    out.add_page(p)
out.write(f)
