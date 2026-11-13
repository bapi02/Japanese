# 인쇄용 PDF (구몬 스타일)

`worksheet.pdf` — 표지 + 20장(앞면 a·뒷면 b) + 정답. B5(182×257mm, 구몬 학습지와 같은 크기) — A4 프린터는 "용지에 맞춤"으로. `../data.js` 내용을 그대로 종이 학습지로 만든 것입니다.

## 다시 만들기

```bash
# 폰트(최초 1회, fonts/ 는 git 에 올리지 않음)
cd worksheet/print/fonts
curl -sSo NotoSansJP-400.ttf "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf"
curl -sSo NotoSansJP-700.ttf "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf"
curl -sSo NotoSansKR-400.ttf "https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf"
curl -sSo NotoSansKR-700.ttf "https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf"
curl -sSo KleeOne-400.ttf "https://fonts.gstatic.com/s/kleeone/v14/LDIxapCLNRc6A8oT4q4A.ttf"
curl -sSo KleeOne-600.ttf "https://fonts.gstatic.com/s/kleeone/v14/LDI2apCLNRc6A8oT4pbYF8Os.ttf"

# 생성 (playwright + chromium 필요)
node worksheet/print/build.js
cp worksheet/print/out/일본어학습지_초급.pdf worksheet/print/worksheet.pdf
```

## 삽화

`img/step_XX.jpg` — 장마다 본문 삽화 1컷 (OpenAI gpt-image-1.5, 수채 파스텔). 다시 만들려면 (api.openai.com 키 필요):

```bash
NODE_USE_ENV_PROXY=1 node worksheet/print/gen-illust.js        # 없는 것만 생성 → img/step_XX.png
python3 -c "from PIL import Image; import glob; [Image.open(f).convert('RGB').resize((600,600)).save(f[:-4]+'.jpg', quality=88) for f in glob.glob('worksheet/print/img/step_*.png')]"
```

## 표지

`cover/cover.jpg` — 스튜디오 제품사진 톤(노트 한 권), 타이포는 `compose-cover.js`가 얹음. 시안을 다시 뽑으려면 `gen-cover2.js`(사진 생성) → `node compose-cover.js <이름>`(미리보기 PNG).
