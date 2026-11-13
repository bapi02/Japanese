# 인쇄용 PDF (구몬 스타일)

`worksheet.pdf` — 표지 + 20장 + 정답 (A4, 46쪽). `../data.js` 내용을 그대로 종이 학습지로 만든 것입니다.

## 다시 만들기

```bash
# 폰트(최초 1회, fonts/ 는 git 에 올리지 않음)
cd worksheet/print/fonts
curl -sSo NotoSansJP-400.ttf "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf"
curl -sSo NotoSansJP-700.ttf "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf"
curl -sSo NotoSansKR-400.ttf "https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf"
curl -sSo NotoSansKR-700.ttf "https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf"
curl -sSo ZenKurenaido.ttf "https://fonts.gstatic.com/s/zenkurenaido/v20/3XFsEr0515BK2u6UUptu_gWJZfw.ttf"

# 생성 (playwright + chromium 필요)
node worksheet/print/build.js
cp worksheet/print/out/일본어학습지_초급.pdf worksheet/print/worksheet.pdf
```
