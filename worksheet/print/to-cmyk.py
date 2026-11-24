#!/usr/bin/env python3
"""인쇄소용 PDF를 CMYK로 변환한다.
1) 무채색(R=G=B)으로 칠한 글자·선은 회색(DeviceGray)으로 바꿔 먹 1도(K)로만 찍히게 하고, 아주 어두운 회색은 K100으로 맞춤
2) Ghostscript로 나머지(삽화·포인트 색)를 CMYK로 변환
사용: to-cmyk.py <in.pdf> <out.pdf>"""
import re, subprocess, sys, tempfile, os
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

src, dst = sys.argv[1], sys.argv[2]
NUM = rb'(\d*\.?\d+)'
PAT = re.compile(rb'(?<![\w.])' + NUM + rb'\s+' + NUM + rb'\s+' + NUM + rb'\s+(rg|RG)(?![\w])')

def fix(data):
    def sub(m):
        r, g, b = (float(m.group(i)) for i in (1, 2, 3))
        if max(r, g, b) - min(r, g, b) > 0.013: return m.group(0)       # 색이 있는 것은 그대로
        v = (r + g + b) / 3
        if v <= 0.14: v = 0.0                                             # 거의 검정 → K100
        return ('%g' % round(v, 3)).encode() + (b' g' if m.group(4) == b'rg' else b' G')
    return PAT.sub(sub, data)

r = PdfReader(src); w = PdfWriter()
seen = set()
def fix_xobjects(res):
    xo = res.get('/XObject') if res else None
    if not xo: return
    for name, ref in xo.get_object().items():
        o = ref.get_object()
        if o.get('/Subtype') == '/Form' and id(o) not in seen:
            seen.add(id(o))
            try: o.set_data(fix(o.get_data()))
            except Exception: pass
            fix_xobjects(o.get('/Resources'))
for p in r.pages:
    w.add_page(p)
for p in w.pages:
    c = p.get_contents()
    if c is not None:
        s = DecodedStreamObject(); s.set_data(fix(c.get_data()))
        p[NameObject('/Contents')] = w._add_object(s)
    fix_xobjects(p.get('/Resources'))
tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False).name
w.write(tmp)
subprocess.run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
                '-sColorConversionStrategy=CMYK', '-dProcessColorModel=/DeviceCMYK', '-dDeviceGrayToK=true',
                '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode', '-dDownsampleColorImages=false',
                '-dDownsampleGrayImages=false', '-dEmbedAllFonts=true', '-dAutoRotatePages=/None',
                f'-sOutputFile={dst}',
                # 그림은 고화질 JPEG로 (기본값은 압축이 강해 수채화가 뭉개짐)
                '-c', '<< /ColorImageDict << /QFactor 0.15 /Blend 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> >> setdistillerparams',
                '-f', tmp], check=True)
os.unlink(tmp)
