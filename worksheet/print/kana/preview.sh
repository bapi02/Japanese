#!/bin/bash
# 미리보기: preview.sh <pdf> <outdir> "a b" "c d" ...  → outdir/s_a.png (펼침면)
PDF="$1"; DIR="$2"; shift 2; mkdir -p "$DIR"
pdftoppm -r 80 -png "$PDF" "$DIR/p"
for a in "$@"; do set -- $a; python3 - "$DIR" "$DIR/s_$1.png" "$@" <<'PY'
import sys, glob
from PIL import Image
S, out = sys.argv[1], sys.argv[2]; pages = [int(x) for x in sys.argv[3:]]
files = sorted(glob.glob(S + "/p-*.png")); ims = [Image.open(files[p - 1]) for p in pages]
w, h = ims[0].size; im = Image.new('RGB', (w * len(ims) + 12 * (len(ims) - 1), h), (120, 120, 120))
for i, x in enumerate(ims): im.paste(x, (i * (w + 12), 0))
im.save(out)
PY
done
