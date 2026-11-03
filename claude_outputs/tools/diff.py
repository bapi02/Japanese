import sys, warnings; warnings.filterwarnings("ignore")
from numbers_parser import Document
from numbers_parser.cell import MergedCell
A = Document(sys.argv[1]).sheets[0].tables[0]
B = Document(sys.argv[2]).sheets[0].tables[0]
OFF = int(sys.argv[3]); FROM = int(sys.argv[4])
mA, mB = A._model, B._model
def desc(t, m, r, c):
    cell = t.cell(r,c)
    if isinstance(cell, MergedCell): return ("MERGED",)
    st = cell.style; b = cell.border
    ts = m.cell_text_style(cell); font = m.char_property(ts,"font_name") if ts is not None else None
    fmt = None
    if getattr(cell,"_num_format_id",None) is not None:
        f = m.table_format(t._table_id, cell._num_format_id); fmt = ("num", f.decimal_places, f.show_thousands_separator, f.format_type)
    if getattr(cell,"_currency_format_id",None) is not None:
        f = m.table_format(t._table_id, cell._currency_format_id); fmt = ("cur", f.decimal_places, f.show_thousands_separator, f.format_type, f.currency_code, f.use_accounting_style)
    bd = tuple((getattr(b,s).style.name, round(getattr(b,s).width,2)) if getattr(b,s) else None for s in ("top","right","bottom","left"))
    return (cell.value, font, st.font_size, st.bold, str(st.font_color), str(st.bg_color), str(st.alignment), fmt, bd, cell.formula)
keys = ["value","font","size","bold","color","bg","align","fmt","border","formula"]
diffs = {}
for r in range(FROM, min(A.num_rows, B.num_rows-OFF)):
    for c in range(10):
        da, db = desc(A,mA,r,c), desc(B,mB,r+OFF,c)
        if da != db:
            if len(da)==1 or len(db)==1: diffs.setdefault("merge", []).append((r,c,da[0] if len(da)==1 else "cell", db[0] if len(db)==1 else "cell")); continue
            for k,x,y in zip(keys,da,db):
                if k=="formula": continue
                if x != y: diffs.setdefault(k, []).append((r,c,x,y))
for k,v in diffs.items():
    print(f"=== {k}: {len(v)} cells")
    for item in v[:int(sys.argv[5]) if len(sys.argv)>5 else 12]: print("   ", item)
hd=[(r, A.row_height(r), B.row_height(r+OFF)) for r in range(FROM, min(A.num_rows,B.num_rows-OFF)) if A.row_height(r)!=B.row_height(r+OFF)]
print("row height diffs:", len(hd), hd[:10])
