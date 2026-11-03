import json, sys, warnings; warnings.filterwarnings("ignore")
from numbers_parser import Document
from numbers_parser.cell import MergedCell
t = Document(sys.argv[1]).sheets[0].tables[0]; S = json.load(open(sys.argv[2]))
REGEN = bool(S[0].get("regenerate"))
def val(r,c):
    cell=t.cell(r,c); return None if isinstance(cell,MergedCell) else cell.value
def fml(r,c): return t.cell(r,c).formula
r = next(rr for rr in range(t.num_rows) if val(rr,0)=="1. 시그니처 위크")
for s in S:
    assert val(r,0)==f"{s['no']}. {s['name']}", (r, val(r,0)); r+=2
    prev_cat=None
    for g in s["groups"]:
        gf=r
        for i,it in enumerate(g["items"]):
            cat = g.get("cat")
            if cat and cat!=prev_cat: assert val(r,0)==cat, (r, val(r,0), cat); prev_cat=cat
            if i==0: assert val(r,1)==g["name2"], (r, val(r,1), g["name2"])
            assert val(r,3)==it["detail2"], (r, val(r,3))
            got=(val(r,5),val(r,6),val(r,7),val(r,8)); exp=(it["unit2"],it["qty2"],it["period2"],it["amount2"])
            assert all(abs(a-b)<0.01 for a,b in zip(got,exp)), (r, got, exp)
            assert fml(r,8)==f"F{r+1}×G{r+1}×H{r+1}", (r, fml(r,8)); r+=1
        assert val(r,1)=="Sub Total" and val(r,2)==f"{g['name2']} Total" and fml(r,8)==f"SUM(I{gf+1}:I{r})" and abs(val(r,8)-g["subtotal2"])<0.5 and t.cell(r,8)._type==101, (r, fml(r,8)); r+=1
    assert val(r,0)==f"{s['name']} Cost Total" and abs(val(r,8)-s["total2"])<0.5 and fml(r,8).count("+")==len(s["groups"])-1 and t.cell(r,8)._type==101, (r, fml(r,8)); r+=2
assert val(r,0)=="Project Total Quotation"; r+=2
tot=0
for no in range(1,11):
    assert val(r,0).startswith(f"{no}. ") and fml(r,5).startswith("I") and fml(r,7)==f"F{r+1}" and t.cell(r,7)._type==101, (r, fml(r,5)); tot+=val(r,7); r+=1
assert "AGENCY" in val(r,0) and abs(val(r,5)-tot*0.1)<1; r+=1
assert fml(r,7).startswith("SUM") and abs(val(r,7)-tot*1.1)<1 and t.cell(r,7)._type==101; r+=1
assert val(r,0)=="Grand Total" and abs(val(r,7)-tot*1.1)<1; gr=r; r+=2
assert val(r,0)=="CANCELLATION POLICY" and r+7==t.num_rows
assert fml(5,1)==f"H{gr+1}" and fml(6,1)=="B6×1.1" and abs(val(5,1)-tot*1.1)<1 and abs(val(6,1)-tot*1.21)<1
print(f"OK rows={t.num_rows} cost={tot:,.0f} VAT-excl={tot*1.1:,.0f} VAT-incl={tot*1.21:,.0f}")
