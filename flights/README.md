# ICN → 日本 · 아시아나 직항 주말 시세

인천에서 일본으로 가는 **아시아나항공(OZ) 직항 왕복**만, **주말 일정 조합**별 최저가를
모바일 화면에서 한눈에 보는 웹입니다.

- 출발: 인천 **06:00 ~ 09:00** 출발편만
- 귀국: 일본 현지 **18:00 ~ 21:00** 출발편만
- 일정: `토·일`(1박2일) · `금·토·일`(2박3일) · `토·일·월`(2박3일) · `금·토·일·월`(3박4일)
- 각 칸에 최저가 + 히트맵 색 + **비싼 이유**(연휴·성수기·잔여석·예약클래스·평균 대비)
- 시간대 · 인원 · 조회 범위는 화면 안 ⚙ 설정에서 바꿀 수 있습니다.

## 지금 상태

`flights/data/prices.json` 에는 **화면 확인용 예시 데이터**가 들어 있고, 앱 상단에
그렇게 표시됩니다. 아래 둘 중 하나(또는 둘 다)를 설정하면 실제 시세로 바뀝니다.

| 경로 | 신선도 | 필요한 것 |
|---|---|---|
| GitHub Actions 자동 수집 | 하루 1회 (저장분) | 저장소 시크릿 |
| Cloudflare Worker 라이브 조회 | 새로고침할 때마다 현시점 | Worker 배포 (무료 플랜 가능) |

둘 다 켜두면 페이지를 열 때 저장분이 **즉시** 뜨고, 화면에 보이는 범위를 라이브로 덮어씁니다.

## 0. Amadeus 키 발급

[developers.amadeus.com](https://developers.amadeus.com) 에서 무료 가입 → 앱 생성 →
`API Key`(client id) 와 `API Secret` 을 받습니다.

> **test 환경은 캐시된 샘플 데이터**라 한국–일본 노선은 결과가 거의 없습니다.
> 실제 시세를 보려면 production(Production key) 로 전환하세요. 무료 호출량이
> 정해져 있으니 아래 `WEEKS` / `DESTS` 로 호출 수를 조절하는 걸 권합니다.

## 1. GitHub Actions 자동 수집

저장소 **Settings → Secrets and variables → Actions** 에서:

- Secrets: `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`
- Variables(선택): `AMADEUS_ENV`(기본 `production`), `FARE_DESTS`(기본 `NRT,HND,KIX,FUK,NGO`), `FARE_WEEKS`(기본 `8`)

워크플로는 `.github/workflows/flight-prices.yml` 입니다. 매일 03:00 KST 에 돌면서
`flights/data/prices.json` 을 갱신하고, 값이 바뀌었을 때만 커밋합니다.

> ⚠️ GitHub 은 **cron 스케줄을 기본 브랜치에서만** 실행합니다. 이 브랜치를 기본
> 브랜치로 병합하기 전까지는 Actions 탭의 **Run workflow** 로 수동 실행하세요.

호출 수 = `목적지 수 × 주 수 × 4(패턴)`. 기본값은 5 × 8 × 4 = **160회/일** 입니다.

## 2. Cloudflare Worker 라이브 조회

```bash
cd flights/worker
npx wrangler login
npx wrangler secret put AMADEUS_CLIENT_ID
npx wrangler secret put AMADEUS_CLIENT_SECRET
npx wrangler deploy
```

배포되면 `https://asiana-japan-fare.<계정>.workers.dev` 같은 주소가 나옵니다.
그 주소를 웹의 **⚙ 설정 → 라이브 시세 프록시 주소** 에 넣고 저장하세요.

- `wrangler.toml` 의 `ALLOWED_ORIGIN` 을 배포한 웹 주소로 좁혀두는 걸 권합니다.
- 같은 조합은 **10분간 캐시**되어 연속 새로고침으로 쿼터를 태우지 않습니다.
  (상세 화면의 `이 조합만 지금 다시 조회` 는 캐시를 우회합니다.)
- API 키는 Worker 시크릿에만 있고 브라우저로 내려가지 않습니다.

## 3. 웹 열기

`flights/index.html` 을 정적 호스팅에 올리면 됩니다. GitHub Pages 라면
**Settings → Pages** 에서 브랜치를 지정한 뒤 `/flights/` 로 접속하세요.

로컬 확인은 ES 모듈 때문에 파일 직접 열기(`file://`)가 아니라 서버가 필요합니다:

```bash
python3 -m http.server 8000
# http://localhost:8000/flights/
```

## 파일 구성

```
flights/
  index.html          화면 (모바일 우선)
  app.js              렌더링 · 필터 · 라이브 갱신
  lib/config.mjs      노선 · 주말 패턴 · 기본 검색조건
  lib/amadeus.mjs     Amadeus 토큰/조회 클라이언트
  lib/search.mjs      응답 정규화 + 시간대·직항·항공사 필터
  lib/analyze.mjs     "비싼 이유" 산출 · 히트맵 분위수
  lib/holidays.mjs    한·일 공휴일 / 성수기 테이블 (2026-2027)
  scripts/collect.mjs Actions 용 수집기
  scripts/make-sample.mjs  예시 데이터 생성기
  worker/worker.js    Cloudflare Worker 프록시
  data/prices.json    수집 결과 (현재는 예시 데이터)
```

`lib/` 는 브라우저 · Node · Worker 가 **같은 파일을 공유**합니다. 노선을 추가하거나
시간대 기본값을 바꾸려면 `lib/config.mjs` 한 곳만 고치면 됩니다.

## 알아둘 점

- 표시 가격은 조회 시점의 참고값입니다. 유류할증료·수수료 정책과 좌석 재고가
  실시간으로 바뀌므로 **실제 결제 금액은 예매 화면에서 확인**하세요.
- 공휴일 표는 사람이 관리합니다(`lib/holidays.mjs`). 대체공휴일은 정부 공고로
  바뀔 수 있으니 시즌마다 한 번 확인하세요.
- 예약클래스 등급 분류는 항공사 공통 관행에 기댄 근사치이며, 정확한 운임규정은
  항공사 공지가 우선입니다.
- 에어서울(RS)·에어부산(BX)은 요청대로 제외했습니다. 포함하려면
  `lib/config.mjs` 의 `DEFAULTS.carriers` 에 코드를 추가하세요.
