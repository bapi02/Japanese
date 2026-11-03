"""Rebuild the WACKER quotation on top of the user's latest Numbers file (keeps their formatting fixes),
rewriting section 1 in place and regenerating sections 2-10, summary and cancellation policy with formulas."""
import json, sys, warnings
warnings.filterwarnings("ignore")
from numbers_parser import Document, Border, RGB
from numbers_parser.cell import MergedCell, NumberCell, CellType
from numbers_parser.generated import TSCEArchives_pb2 as TSCE
from numbers_parser.constants import OwnerKind
from numbers_parser.model import clear_field_container

SRC, OUT, DATA = sys.argv[1], sys.argv[2], sys.argv[3]
S = json.load(open(DATA))
doc = Document(SRC)
t = doc.sheets[0].tables[0]
tid = t._table_id
m = t._model
NC = t.num_cols

orig = [[t.cell(r, c) for c in range(NC)] for r in range(t.num_rows)]
for row in orig:
    for cell in row:
        _ = cell.border
orig_heights = {r: t.row_height(r) for r in range(t.num_rows)}

def colval(r, c=0):
    cell = orig[r][c]
    return cell.value if not isinstance(cell, MergedCell) else None
def find_row(pred, start=0):
    return next(r for r in range(start, len(orig)) if pred(colval(r)))

# ---------- locate template rows ----------
T0 = find_row(lambda v: v == "1. 시그니처 위크")            # section-1 title
R_TQ = find_row(lambda v: v == "Total Quotation")            # top block
R_VAT = find_row(lambda v: isinstance(v, str) and v.strip() == "VAT Included", R_TQ)
R_COST1 = T0 + 32
assert colval(R_COST1) == "시그니처 위크 Cost Total", colval(R_COST1)
START = R_COST1 + 2                                            # first row after section 1 (+ blank)
R_STITLE = find_row(lambda v: isinstance(v, str) and v.strip() == "Project Total Quotation", START)
R_SHDR, R_SLINE = R_STITLE + 1, R_STITLE + 2
R_SFEE = find_row(lambda v: isinstance(v, str) and "AGENCY FEE" in v, R_SLINE)
R_SPROJ = find_row(lambda v: isinstance(v, str) and v.strip() == "Project Total Quotation", R_SFEE)
R_SGRAND = find_row(lambda v: isinstance(v, str) and v.strip() == "Grand Total", R_SPROJ)
R_CANCEL = find_row(lambda v: isinstance(v, str) and v.startswith("CANCELLATION"), R_SGRAND)
T_TITLE, T_HDR, T_I1, T_SUB, T_COST, T_BLANK = (orig[i] for i in (T0, T0 + 1, T0 + 2, T0 + 4, R_COST1, R_COST1 + 1))
T_STITLE, T_SHDR, T_SLINE, T_SFEE, T_SPROJ, T_SGRAND = (orig[i] for i in (R_STITLE, R_SHDR, R_SLINE, R_SFEE, R_SPROJ, R_SGRAND))
T_CANCEL = [orig[i] for i in range(R_CANCEL, R_CANCEL + 7)]
H = dict(title=orig_heights[T0], hdr=orig_heights[T0 + 1], item=orig_heights[T0 + 2], sub=orig_heights[T0 + 4],
         cost=orig_heights[R_COST1], blank=orig_heights[R_COST1 + 1], stitle=orig_heights[R_STITLE], shdr=orig_heights[R_SHDR],
         sline=orig_heights[R_SLINE], sproj=orig_heights[R_SPROJ], sgrand=orig_heights[R_SGRAND])
cancel_heights = [orig_heights[i] for i in range(R_CANCEL, R_CANCEL + 7)]
mm = m.merge_cells(tid)
cancel_merges = sorted({tuple(ref.rect) for (r, c), ref in list(mm._references.items()) if r >= R_CANCEL and getattr(ref, "rect", None)})

# ---------- cell helpers ----------
def snap(cell):
    return dict(cs=cell._cell_style_id, ts=cell._text_style_id, nf=getattr(cell, "_num_format_id", None),
                cf=getattr(cell, "_currency_format_id", None), tf=getattr(cell, "_text_format_id", None),
                type=getattr(cell, "_type", None))
def apply_snap(r, c, sn):
    cell = t._data[r][c]
    cell._cell_style_id = sn["cs"]; cell._text_style_id = sn["ts"]
    cell._num_format_id = sn["nf"]; cell._currency_format_id = sn["cf"]; cell._text_format_id = sn["tf"]
    if sn["type"] == CellType.CURRENCY and isinstance(cell, NumberCell):
        cell._type = CellType.CURRENCY      # Numbers only applies a currency/accounting format to currency-type cells
def put(r, c, value, tmpl):
    t.write(r, c, value); apply_snap(r, c, snap(tmpl))
SOLID = Border(1.0, RGB(0, 0, 0), "solid"); DASH = Border(0.5, RGB(0, 0, 0), "dashes")
def border(r, c, top=None, right=None, bottom=None, left=None):
    for side, b in (("top", top), ("right", right), ("bottom", bottom), ("left", left)):
        if b is not None:
            try: t.set_cell_border(r, c, side, b)
            except Exception: pass
def copy_borders(r, c, tmpl):
    b = tmpl.border; border(r, c, b.top, b.right, b.bottom, b.left)
def rewrite(r, c, value):
    """overwrite a kept cell's value, preserving style, format, formula and borders"""
    cell = t._data[r][c]; sn = snap(cell); b = cell.border; fid = cell._formula_id
    t.write(r, c, value); apply_snap(r, c, sn); t._data[r][c]._formula_id = fid
    border(r, c, b.top, b.right, b.bottom, b.left)

# ---------- formulas (relative-reference ASTs stored in the table's formula list) ----------
FL = m._formulas; FL.add_table(tid); FD = FL._datalists[tid]
KEY_FGH = orig[T0 + 2][8]._formula_id
KEY_SAME_ROW_F = orig[R_SLINE][7]._formula_id
assert orig[T0 + 2][8].formula.startswith("F") and orig[R_SLINE][7].formula.startswith("F"), (orig[T0 + 2][8].formula, orig[R_SLINE][7].formula)
NT = TSCE.ASTNodeArrayArchive.ASTNodeType
def _node(**kw): return TSCE.ASTNodeArrayArchive.ASTNodeArchive(**kw)
def cell_ref(drow, dcol):
    return _node(AST_node_type=NT.CELL_REFERENCE_NODE,
                 AST_column=TSCE.ASTNodeArrayArchive.ASTColumnCoordinateArchive(column=dcol, absolute=False),
                 AST_row=TSCE.ASTNodeArrayArchive.ASTRowCoordinateArchive(row=drow, absolute=False))
def tract(row_begin, row_end, col_begin, col_end=None):
    ct = TSCE.ASTNodeArrayArchive.ASTColonTractArchive(preserve_rectangular=True)
    rc = ct.relative_column.add(); rc.range_begin = col_begin
    if col_end is not None and col_end != col_begin: rc.range_end = col_end
    rr = ct.relative_row.add(); rr.range_begin = row_begin
    if row_end != row_begin: rr.range_end = row_end
    return _node(AST_node_type=NT.COLON_TRACT_NODE,
                 AST_sticky_bits=TSCE.ASTNodeArrayArchive.ASTStickyBits(begin_row_is_absolute=False, begin_column_is_absolute=False, end_row_is_absolute=False, end_column_is_absolute=False),
                 AST_colon_tract=ct)
def fn_sum(): return _node(AST_node_type=NT.FUNCTION_NODE, AST_function_node_index=168, AST_function_node_numArgs=1)
def op(t_): return _node(AST_node_type=t_)
def num_0_1(): return _node(AST_node_type=NT.NUMBER_NODE, AST_number_node_number=0.1, AST_number_node_decimal_low=1, AST_number_node_decimal_high=3476215962376601600)
def formula_key(nodes):
    f = TSCE.FormulaArchive(); f.AST_node_array.AST_node.extend(nodes); return FL.lookup_key(tid, f)
def use_key(key): FD["by_key"][key].refcount += 1; return key
def set_formula(r, c, key): t._data[r][c]._formula_id = key
def f_sum_col(r, first, last): return formula_key([tract(first - r, last - r, 0, 0), fn_sum()])
def f_add_rows(r, rows):
    nodes = [cell_ref(rows[0] - r, 0)]
    for x in rows[1:]: nodes += [cell_ref(x - r, 0), op(NT.ADDITION_NODE)]
    return formula_key(nodes)

REGEN = bool(S[0].get("regenerate"))
DEL_FROM = T0 if REGEN else START
# ---------- section 1: rewrite in place (rows T0+2 .. R_COST1) ----------
s1 = S[0]
r = T0 + 2
for g in ([] if REGEN else s1["groups"]):
    gfirst = r
    for i, it in enumerate(g["items"]):
        if i == 0:
            assert not isinstance(t._data[r][1], MergedCell); rewrite(r, 1, g["name2"])
        if it["item"] is not None:
            assert not isinstance(t._data[r][2], MergedCell) and t._data[r][2].value, (r, "expected a Description cell")
            rewrite(r, 2, it["item2"])
        rewrite(r, 3, it["detail2"]); rewrite(r, 5, it["unit2"]); rewrite(r, 6, it["qty2"]); rewrite(r, 7, it["period2"])
        rewrite(r, 8, it["amount2"])
        r += 1
    assert t._data[r][1].value == "Sub Total", (r, t._data[r][1].value)
    rewrite(r, 2, f"{g['name2']} Total"); rewrite(r, 8, g["subtotal2"]); r += 1
if not REGEN:
    assert r == R_COST1 and t._data[r][0].value == "시그니처 위크 Cost Total"
    rewrite(R_COST1, 8, s1["total2"])

# ---------- drop everything after section 1 and rebuild ----------
for key in [k for k in list(mm._references.keys()) if k[0] >= DEL_FROM]:
    del mm._references[key]
t.delete_row(t.num_rows - DEL_FROM, DEL_FROM)
rows_plan, merges, pending_borders = [], [], []
def colL(c): return chr(ord("A") + c)
def rng(r1, c1, r2, c2): return f"{colL(c1)}{r1+1}:{colL(c2)}{r2+1}"
def new_row(height):
    t.add_row(1); r = t.num_rows - 1; rows_plan.append((r, height)); return r
def blank_row():
    r = new_row(H["blank"])
    for c in range(NC): put(r, c, None, T_BLANK[c])
    pending_borders.append(("copy", r, T_BLANK))

section_rows = []
for s in (S if REGEN else S[1:]):
    no, name = s["no"], s["name"]
    r = new_row(H["title"]); put(r, 0, f"{no}. {name}", T_TITLE[0])
    for c in range(1, NC): put(r, c, None, T_TITLE[c] if not isinstance(T_TITLE[c], MergedCell) else T_TITLE[0])
    merges.append(rng(r, 0, r, 2)); pending_borders.append(("copy", r, T_TITLE))
    r = new_row(H["hdr"])
    for c, v in enumerate(["List", "Sub-List", "Description", "Detail", None, "Unit Cost", "Quantity", "Day", "Amount", "Remark"]):
        put(r, c, v, T_HDR[c] if not isinstance(T_HDR[c], MergedCell) else T_HDR[3])
    merges.append(rng(r, 3, r, 4)); pending_borders.append(("copy", r, T_HDR))
    first_item_row, sub_rows = None, []
    cat_runs = []          # [(cat, first_row, last_row)]
    for g in s["groups"]:
        g_first = None; run_start = run_end = None
        cat = g.get("cat", name)
        for ii, it in enumerate(g["items"]):
            r = new_row(H["item"])
            if first_item_row is None: first_item_row = r
            if not cat_runs or cat_runs[-1][0] != cat:
                put(r, 0, cat, T_I1[0]); cat_runs.append([cat, r, r])
            if g_first is None: g_first = r; put(r, 1, g["name2"], T_I1[1])
            if it["item"] is not None:
                if run_start is not None and run_end > run_start: merges.append(rng(run_start, 2, run_end, 2))
                put(r, 2, it["item2"], T_I1[2]); run_start = r
            run_end = r
            put(r, 3, it["detail2"], T_I1[3]); merges.append(rng(r, 3, r, 4))
            put(r, 5, it["unit2"], T_I1[5]); put(r, 6, it["qty2"], T_I1[6]); put(r, 7, it["period2"], T_I1[7])
            put(r, 8, it["amount2"], T_I1[8]); set_formula(r, 8, use_key(KEY_FGH))
            put(r, 9, str(it["remark"]) if it["remark"] not in (None, "") else None, T_I1[9])
            pending_borders.append(("item", r, ii == 0))
        g_last = r
        if run_start is not None and run_end > run_start: merges.append(rng(run_start, 2, run_end, 2))
        if g_last > g_first: merges.append(rng(g_first, 1, g_last, 1))
        r = new_row(H["sub"])
        put(r, 1, "Sub Total", T_SUB[1]); put(r, 2, f"{g['name2']} Total", T_SUB[2])
        for c in range(3, 8): put(r, c, None, T_SUB[2])
        merges.append(rng(r, 2, r, 7))
        put(r, 8, g["subtotal2"], T_SUB[8]); set_formula(r, 8, f_sum_col(r, g_first, g_last)); put(r, 9, None, T_SUB[9])
        pending_borders.append(("sub", r)); sub_rows.append(r); cat_runs[-1][2] = r
    for cat, a, b in cat_runs:
        if b > a: merges.append(rng(a, 0, b, 0))
    r = new_row(H["cost"]); put(r, 0, f"{name} Cost Total", T_COST[0])
    for c in range(1, 8): put(r, c, None, T_COST[0])
    merges.append(rng(r, 0, r, 7))
    put(r, 8, s["total2"], T_COST[8]); set_formula(r, 8, f_add_rows(r, sub_rows)); put(r, 9, None, T_COST[9])
    pending_borders.append(("copy", r, T_COST)); section_rows.append((no, name, r, s["total2"]))
    blank_row()

# ---------- summary ----------
all_sections = section_rows if REGEN else [(1, s1["name"], R_COST1, s1["total2"])] + section_rows
r = new_row(H["stitle"]); put(r, 0, "Project Total Quotation", T_STITLE[0])
for c in range(1, NC): put(r, c, None, T_STITLE[c] if not isinstance(T_STITLE[c], MergedCell) else T_STITLE[0])
merges.append(rng(r, 0, r, 2)); pending_borders.append(("copy", r, T_STITLE))
r = new_row(H["shdr"])
for c, v in enumerate(["List", None, "Description", "Detail", None, "Unit Cost", None, "Amount", None, "Remark"]):
    put(r, c, v, T_SHDR[c] if not isinstance(T_SHDR[c], MergedCell) else T_SHDR[c - 1])
merges += [rng(r, 0, r, 1), rng(r, 3, r, 4), rng(r, 5, r, 6), rng(r, 7, r, 8)]; pending_borders.append(("copy", r, T_SHDR))
def sline(label, desc, amount, tmpl, fkey):
    r = new_row(H["sline"])
    put(r, 0, label, tmpl[0]); put(r, 1, None, tmpl[0]); put(r, 2, desc, tmpl[2])
    put(r, 3, "-", tmpl[3]); put(r, 4, None, tmpl[3])
    put(r, 5, amount, tmpl[5]); put(r, 6, None, tmpl[5]); set_formula(r, 5, fkey(r))
    put(r, 7, amount, tmpl[7]); put(r, 8, None, tmpl[7]); set_formula(r, 7, use_key(KEY_SAME_ROW_F))
    put(r, 9, None, tmpl[9])
    merges.extend([rng(r, 0, r, 1), rng(r, 3, r, 4), rng(r, 5, r, 6), rng(r, 7, r, 8)]); pending_borders.append(("copy", r, tmpl))
    return r
line_rows, cost_sum = [], 0
for no, name, cost_row, total in all_sections:
    line_rows.append(sline(f"{no}. {name}", f"{name} Cost Total", total, T_SLINE, lambda r, cr=cost_row: formula_key([cell_ref(cr - r, 3)])))
    cost_sum += total
fee = cost_sum * 0.1
fee_row = sline(f"{len(all_sections)+1}. AGENCY FEE", "10% of Total Cost", fee, T_SFEE,
                lambda r: formula_key([tract(line_rows[0] - r, line_rows[-1] - r, 2, 2), fn_sum(), num_0_1(), op(NT.MULTIPLICATION_NODE)]))
grand = cost_sum + fee
for label, tmpl, hk in (("Project Total Quotation", T_SPROJ, "sproj"), ("Grand Total", T_SGRAND, "sgrand")):
    r = new_row(H[hk]); put(r, 0, label, tmpl[0])
    for c in range(1, 7): put(r, c, None, tmpl[0])
    put(r, 7, grand, tmpl[7]); put(r, 8, None, tmpl[7]); put(r, 9, None, tmpl[9])
    if hk == "sproj": set_formula(r, 7, formula_key([tract(line_rows[0] - r, fee_row - r, 0, 1), fn_sum()])); proj_row = r
    else: set_formula(r, 7, formula_key([tract(proj_row - r, proj_row - r, 0, 1), fn_sum()])); grand_row = r
    merges.extend([rng(r, 0, r, 6), rng(r, 7, r, 8)]); pending_borders.append(("copy", r, tmpl))
blank_row()
cancel_base = t.num_rows
for i, trow in enumerate(T_CANCEL):
    r = new_row(cancel_heights[i])
    for c in range(NC):
        if not isinstance(trow[c], MergedCell): put(r, c, trow[c].value, trow[c])
    pending_borders.append(("copy", r, trow))
for (rs, cs, re_, ce) in cancel_merges:
    off = cancel_base - R_CANCEL; merges.append(rng(rs + off, cs, re_ + off, ce))

# ---------- top block ----------
rewrite(R_TQ, 1, grand); set_formula(R_TQ, 1, formula_key([cell_ref(grand_row - R_TQ, 6)]))   # =H<grand total>
vat_incl = grand * 1.1
rewrite(R_VAT, 1, vat_incl)                                                                 # keeps its own =B<x>×1.1 formula

# ---------- merges, borders, heights ----------
kept_borders = {(r, c): (b.top, b.right, b.bottom, b.left) for r in range(DEL_FROM) for c in range(NC) for b in [t._data[r][c].border]}
t.merge_cells(merges)
for (r, c), (bt, br, bb, bl) in kept_borders.items(): border(r, c, bt, br, bb, bl)
for pb in pending_borders:
    if pb[0] == "copy":
        for c in range(NC): copy_borders(pb[1], c, pb[2][c])
    elif pb[0] == "item":
        for c in range(NC): border(pb[1], c, top=SOLID if pb[2] else DASH, right=SOLID, bottom=DASH, left=SOLID)
    elif pb[0] == "sub":
        for c in range(NC): border(pb[1], c, top=DASH, right=SOLID, bottom=SOLID, left=SOLID)
for r, h in rows_plan: t.row_height(r, h)
for r in range(DEL_FROM): t.row_height(r, orig_heights[r])

# stale calc-engine merge caches -> region map is the single source of truth
clear_field_container(m.objects[tid].merge_owner.formula_store.formulas)
owner_id_map, table_base_id = m.owner_id_map(), m.table_base_id(tid)
for fid in m.find_refs("FormulaOwnerDependenciesArchive"):
    dep = m.objects[fid]
    if dep.owner_kind != OwnerKind.MERGE_OWNER: continue
    keep = [rec for rec in dep.range_dependencies.back_dependency if owner_id_map.get(rec.internal_range_reference.owner_id) != table_base_id]
    if len(keep) != len(dep.range_dependencies.back_dependency):
        clear_field_container(dep.range_dependencies.back_dependency); dep.range_dependencies.back_dependency.extend(keep)
doc.save(OUT)
print("rows:", t.num_rows, "| sections:", [(no, f"{tot:,.0f}") for no, _, _, tot in all_sections])
print(f"cost {cost_sum:,} | fee {fee:,.1f} | VAT-excl {grand:,.1f} | VAT-incl {vat_incl:,.2f}")
