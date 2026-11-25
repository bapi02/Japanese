#!/usr/bin/env python3
"""B5 PDF를 A4 용지 가운데에 실제 크기로 얹고 모서리 재단선을 그린다.
사용: a4-cropmarks.py <in.pdf> <out.pdf> [첫쪽 끝쪽]"""
import io, sys
from pypdf import PdfReader, PdfWriter, Transformation, PageObject
from reportlab.pdfgen import canvas
MM = 72 / 25.4
A4W, A4H = 210 * MM, 297 * MM
src, dst = sys.argv[1], sys.argv[2]
r = PdfReader(src)
first, last = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1, len(r.pages))
BW, BH = float(r.pages[0].mediabox.width), float(r.pages[0].mediabox.height)
tx, ty = (A4W - BW) / 2, (A4H - BH) / 2
buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(A4W, A4H)); c.setLineWidth(0.4); c.setStrokeGray(0.25)
gap, ln = 2 * MM, 7 * MM
for x in (tx, tx + BW):
    for y in (ty, ty + BH):
        sx = -1 if x == tx else 1; sy = -1 if y == ty else 1
        c.line(x + sx * gap, y, x + sx * (gap + ln), y)
        c.line(x, y + sy * gap, x, y + sy * (gap + ln))
c.save(); marks = PdfReader(io.BytesIO(buf.getvalue())).pages[0]
w = PdfWriter()
for p in r.pages[first - 1:last]:
    page = PageObject.create_blank_page(width=A4W, height=A4H)
    page.merge_transformed_page(p, Transformation().translate(tx, ty))
    page.merge_page(marks)
    w.add_page(page)
w.write(dst); print(dst, len(w.pages), 'pages')
