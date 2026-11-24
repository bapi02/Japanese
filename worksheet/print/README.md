# BaPi 일본어 학습지 · 인쇄용 PDF

`worksheet.pdf`(1권, STEP 1~20) · `worksheet2.pdf`(2권, STEP 21~40) · `worksheet3.pdf`(3권, STEP 41~61, 보충 1장 포함) — 표지 + 20장(앞면 a·뒷면 b) + 정답. B5(182×257mm) — A4 프린터는 "용지에 맞춤"으로. `../data.js` 내용을 그대로 종이 학습지로 만든 것입니다.

## 다시 만들기

```bash
# 폰트(최초 1회, fonts/ 는 git 에 올리지 않음)
cd worksheet/print/fonts
curl -sSo NotoSansJP-400.ttf "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf"
curl -sSo NotoSansJP-700.ttf "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf"
curl -sSo NotoSansKR-400.ttf "https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf"
curl -sSo NotoSansKR-700.ttf "https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf"
curl -sSo KleeOne-400.ttf "https://fonts.gstatic.com/s/kleeone/v14/LDIxapCLNRc6A8oT4q4A.ttf"
curl -sSo KleeOne-600.ttf "https://fonts.gstatic.com/s/kleeone/v14/LDI2apCLNRc6A8oT4pbYF8Os.ttf"

# 생성 (playwright + chromium 필요)
node worksheet/print/build.js 1 && cp worksheet/print/out/일본어학습지_초급.pdf worksheet/print/worksheet.pdf
node worksheet/print/build.js 2 && cp worksheet/print/out/일본어학습지_초급2.pdf worksheet/print/worksheet2.pdf
node worksheet/print/build.js 3 && cp worksheet/print/out/일본어학습지_초급3.pdf worksheet/print/worksheet3.pdf
```

## 0권 (문자편 · 히라가나 + 가타카나)

```bash
node worksheet/print/kana/build.js screen   && cp worksheet/print/out/일본어학습지_0권.pdf worksheet/print/worksheet0.pdf
node worksheet/print/kana/build.js wireless # 인쇄소용 내지 188×263mm (재단 여백 3mm, 제본 쪽 여백 홀짝 교대)
```

- 히라가나 H01~H16, 가타카나 K01~K18. 단원마다 2쪽(왼쪽 익히기 / 오른쪽 문제), 내지 74쪽.
- 단원 내용은 `kana/data.js`, 단원 구성은 `kana/units.js`, 인쇄 레이아웃은 `kana/build.js`.
- 웹 학습지용 데이터는 `node worksheet/print/kana/gen-web.js` 로 `worksheet/data0.js` 를 다시 만든다. 웹 0권은 종이와 공부법이 달라서, 같은 단원 정의에서 글자·낱말·비교 쌍만 뽑아 탭으로 푸는 4단계(배우기 → 고르기 → 낱말 조립 → 타임어택)로 바꾼다. 그림 자리는 아직 빈 상자(IMAGE)이고 표지도 자리만 잡아 둠.
- 획순 그림은 `kana/strokes.json`(KanjiVG, © Ulrich Apel, CC BY-SA 3.0)에서 그림. 책 마지막 쪽에 출처 표기가 들어감.
- 글꼴은 임시 HTML 파일을 열어서 싣는다. `setContent`(about:blank)에서는 `file://` 글꼴이 막혀 시스템 글꼴로 대체되기 때문. 1~3권 `build.js`는 아직 `setContent` 방식이라 Klee·Noto 대신 시스템 대체 글꼴로 나온다.

## 삽화

`img/step_XX.jpg` — 장마다 본문 삽화 1컷 (OpenAI gpt-image-1.5, 수채 파스텔). 다시 만들려면 (api.openai.com 키 필요):

```bash
NODE_USE_ENV_PROXY=1 node worksheet/print/gen-illust.js        # 없는 것만 생성 → img/step_XX.png
python3 -c "from PIL import Image; import glob; [Image.open(f).convert('RGB').resize((600,600)).save(f[:-4]+'.jpg', quality=88) for f in glob.glob('worksheet/print/img/step_*.png')]"
```

## 표지

`cover/cover.jpg` — 스튜디오 제품사진 톤(노트 한 권), 타이포는 `compose-cover.js`가 얹음. 시안을 다시 뽑으려면 `gen-cover2.js`(사진 생성) → `node compose-cover.js <이름>`(미리보기 PNG).

## 인쇄소(성원애드피아 등) 입고용

```bash
node worksheet/print/build.js 1 wireless 4     # 1권 무선제본: 표지 펼침면(뒤표지+책등 4mm+앞표지) + 내지, 재단여백 3mm, 제본쪽 여백 6mm
node worksheet/print/build.js 1 spring         # 1권 스프링: 표지 낱장 + 내지, 재단여백 3mm, 제본쪽 여백 10mm
node worksheet/print/build.js 2 wireless 4.5   # 2권 (책등 두께는 주문 화면 값으로 바꿔서)
node worksheet/print/build.js 2 spring
```
결과는 `out/` 에 `..._표지(_펼침).pdf` + `..._내지.pdf` 두 파일로 나옴. 내지 크기 188×263mm(B5+3mm), 홀수쪽은 왼쪽·짝수쪽은 오른쪽에 제본 여백.

## CMYK 변환 (인쇄소가 CMYK를 요구할 때)

```bash
apt-get install -y ghostscript            # 최초 1회
python3 worksheet/print/to-cmyk.py <입력.pdf> <출력_CMYK.pdf>
```
검은 글자·선은 먹 1도(K)로, 삽화와 포인트 색은 CMYK로 변환됩니다. 페이지 크기와 쪽수는 그대로.
