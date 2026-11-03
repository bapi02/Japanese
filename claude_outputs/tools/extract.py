import openpyxl, re, json, sys, warnings
warnings.filterwarnings("ignore")
SRC = sys.argv[1]
wbv = openpyxl.load_workbook(SRC, data_only=True)
tot = wbv["Total_2027 한화생명"]
cats = [(tot.cell(r,2).value, tot.cell(r,3).value, tot.cell(r,4).value) for r in range(9,19)]
sheet_order = wbv.sheetnames[1:]
def clean(s):
    if s is None: return None
    s = str(s).replace("\n"," ").strip()
    s = re.sub(r"^\d+\s*\.?\s*", "", s)
    return re.sub(r"\s+", " ", s).strip()
def is_sub(v):
    return isinstance(v,str) and re.match(r"^소\s*계", v.strip()) is not None
sections=[]
for idx,(no,cat,amt) in enumerate(cats):
    wsv = wbv[sheet_order[idx]]
    hdr=None
    for r in range(1,30):
        for c in range(1,8):
            v = wsv.cell(r,c).value
            if isinstance(v,str) and v.strip()=="구분": hdr=(r,c); break
        if hdr: break
    hr, c0 = hdr
    cols = {}
    for c in range(c0, c0+12):
        v = wsv.cell(hr,c).value
        if isinstance(v,str) and v.strip(): cols[v.strip()] = c
    C = lambda name, r: wsv.cell(r, cols[name]).value
    groups=[]; cur=None
    r = hr+1
    while True:
        b = C("구분", r)
        if isinstance(b,str) and b.strip()=="합계": break
        if r > hr+120: raise SystemExit(f"no 합계 found in {sheet_order[idx]}")
        c = C("항목", r)
        if is_sub(b) or is_sub(c):
            cur["subtotal"] = C("금액", r)
        else:
            if b not in (None,"") and (cur is None or cur["raw"] != b):
                cur = {"raw": b, "name": clean(b), "items": [], "subtotal": None}
                groups.append(cur)
            u = C("단가", r)
            item = {"item": c.strip() if isinstance(c,str) else c, "detail": C("내역", r), "unit": C("단위", r),
                    "qty": C("수량", r), "period": C("기간", r), "unit_cost": u if isinstance(u,(int,float)) else 0,
                    "amount": C("금액", r) or 0, "remark": C("비고", r)}
            cur["items"].append(item)
        r += 1
    foot = {}
    for k in range(r, r+6):
        lab = C("구분", k)
        if lab: foot[str(lab).strip()] = C("금액", k)
    sections.append({"no": no, "name": cat.strip(), "sheet": sheet_order[idx], "total_amt": amt, "groups": groups, "footer": foot})
json.dump(sections, open("work/hive.json","w"), ensure_ascii=False, indent=1, default=str)
grand=0
for s in sections:
    gsum = 0
    for g in s["groups"]:
        isum = 0
        for it in g["items"]:
            q = it["qty"] or 0; p = it["period"]; u = it["unit_cost"] or 0
            calc = u*q*(p if isinstance(p,(int,float)) else 1)
            amt = it["amount"] or 0
            if abs(calc-amt) > 0.5:
                print(f"MISMATCH {s['no']} {s['name']} | {g['name']} | {it['item']} | {it['detail']} | u={u} q={q} p={p} amt={amt} calc={calc}")
            isum += amt
        if g["subtotal"] is None or abs(isum-g["subtotal"])>0.5:
            print(f"SUBTOTAL MISMATCH {s['no']} {g['name']} items={isum} sub={g['subtotal']}")
        gsum += isum
    f = s["footer"]
    ok = abs(gsum - f.get("합계",0))<0.5 and abs(round(gsum*1.1*1.1) - s["total_amt"]) < 2
    print(f"{s['no']:>2} {s['name']:<24} groups={len(s['groups']):<2} items={sum(len(g['items']) for g in s['groups']):<3} 합계={gsum:>13,.0f} 총계={f.get('총계',0):>13,.0f} GrandTotal(VAT)={s['total_amt']:>13,.0f} {'OK' if ok else 'CHECK'}")
    grand += gsum
print("sum of 합계 (1-10):", f"{grand:,.0f}", " +10% fee:", f"{grand*1.1:,.0f}", " +VAT:", f"{grand*1.21:,.0f}")
