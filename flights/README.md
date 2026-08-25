# ICN → 日本 · 아시아나 직항 주말 시세

인천에서 일본으로 가는 **아시아나항공(OZ) 직항 왕복**만, **주말 일정 조합**별 최저가를
모바일 화면에서 한눈에 보는 웹입니다.

- 출발: 인천 **06:00 ~ 09:00** 출발편만
- 귀국: 일본 현지 **18:00 ~ 21:00** 출발편만
- 일정: `토·일`(1박2일) · `금·토·일`(2박3일) · `토·일·월`(2박3일) · `금·토·일·월`(3박4일)
- 좌석등급: **이코노미 + 비즈니스**. 이코노미는 자동 수집하고, 비즈니스는 보고 싶은
  칸을 눌렀을 때만 조회합니다(무료 한도 절약). 칸마다 비즈니스 가격과 배수(`×3.2`)가 붙습니다.
- 각 칸에 최저가 + 히트맵 색 + **비싼 이유**

시간대 · 인원 · 조회 범위는 화면 안 ⚙ 설정에서 바꿀 수 있습니다.

## 데이터 출처

**SerpApi Google Flights** 를 씁니다. 원래 Amadeus Self-Service 로 만들었지만
**2026년 7월 17일자로 포털이 폐기**되어 갈아탔습니다.

SerpApi 를 고른 이유는 요청 단계에서 조건을 그대로 지정할 수 있어서입니다:

| 요구사항 | 파라미터 |
|---|---|
| 아시아나만 | `include_airlines=OZ` |
| 직항만 | `stops=1` |
| 이코노미 / 비즈니스 | `travel_class=1` / `3` |
| 06–09시 출발 | `outbound_times=6,9` |
| 18–21시 귀국 | `return_times=18,21` |

`outbound_times` 는 '시' 단위라 09:59 까지 넘어옵니다. 정확한 09:00 컷은
`lib/search.mjs` 가 응답에서 한 번 더 거릅니다.

### 왕복 조회가 2단계인 점

Google Flights 구조상 왕복은 **가는편을 고른 뒤에야 오는편이 확정**됩니다.

1. 첫 호출 → 가는편 후보 + **왕복 총액** + `price_insights` (호출 1회)
2. `departure_token` 재조회 → 그 가는편에 붙는 **오는편 후보** (호출 1회)

그리드는 1번만 씁니다. 가격은 `return_times=18,21` 조건이 반영된 왕복 총액이라
정확하고, 실제 귀국 편명·시각이 궁금할 때만 상세 화면에서 `귀국편 후보 보기`로
2번을 부릅니다. 이렇게 해서 호출을 절반으로 줄였습니다.

## 지금 상태

`flights/data/prices.json` 에는 **화면 확인용 예시 데이터**가 들어 있고, 앱 상단에
그렇게 표시됩니다. 아래 둘 중 하나(또는 둘 다)를 설정하면 실제 시세로 바뀝니다.

| 경로 | 신선도 | 필요한 것 |
|---|---|---|
| GitHub Actions 자동 수집 | 주 1회 (저장분) | 저장소 시크릿 |
| Cloudflare Worker 라이브 조회 | 새로고침할 때마다 현시점 | Worker 배포 (무료 플랜 가능) |

## 0. SerpApi 키 발급

[serpapi.com](https://serpapi.com) 가입 → 대시보드에서 **Private API Key** 복사.
무료 플랜은 **월 250회**, 카드 등록 없이 매월 갱신됩니다.

### 무료 250회를 어떻게 나눠 쓰나

기본 설정은 **2개 노선 × 5주 × 4패턴 × 이코노미 = 40회**, 주 1회 수집 → **월 160회**.
남는 **약 90회**가 라이브 갱신 · 비즈니스 조회 · 귀국편 조회 몫입니다.

한도를 늘리고 싶으면 `FARE_DESTS` / `FARE_WEEKS` 를 올리고, 부족하면 줄이세요.
계산식은 `노선 수 × 주 수 × 4(패턴) × 좌석등급 수 × 월 수집 횟수` 입니다.
더 넓게 보려면 SerpApi Developer 플랜($75/월 5,000회)으로 올린 뒤 설정만 키우면 됩니다.

## 1. GitHub Actions 자동 수집

저장소 **Settings → Secrets and variables → Actions** 에서:

- Secrets: `SERPAPI_KEY`
- Variables(선택): `FARE_DESTS`(기본 `NRT,KIX`), `FARE_WEEKS`(기본 `5`),
  `FARE_CABINS`(기본 `ECONOMY`)

워크플로는 `.github/workflows/flight-prices.yml` 입니다. 매주 월요일 03:00 KST 에
돌면서 `flights/data/prices.json` 을 갱신하고, 값이 바뀌었을 때만 커밋합니다.

> ⚠️ GitHub 은 **cron 스케줄을 기본 브랜치에서만** 실행합니다. 이 브랜치를 기본
> 브랜치로 병합하기 전까지는 Actions 탭의 **Run workflow** 로 수동 실행하세요.

## 2. Cloudflare Worker 라이브 조회

```bash
cd flights/worker
npx wrangler login
npx wrangler secret put SERPAPI_KEY
npx wrangler deploy
```

배포되면 `https://asiana-japan-fare.<계정>.workers.dev` 같은 주소가 나옵니다.
그 주소를 웹의 **⚙ 설정 → 라이브 시세 프록시 주소** 에 넣고 저장하세요.

- `wrangler.toml` 의 `ALLOWED_ORIGIN` 을 배포한 웹 주소로 좁혀두는 걸 권합니다.
- 같은 조합은 **10분간 캐시**되어 연속 새로고침으로 한도를 태우지 않습니다.
  (상세 화면의 `이 조합만 지금 다시 조회` 는 캐시를 우회합니다.)
- 화면에서 `이코노미`나 `비즈니스` 하나만 선택해 두면 라이브 갱신도 그 등급만 조회합니다.
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
  lib/config.mjs      노선 · 주말 패턴 · 좌석등급 · 기본 검색조건
  lib/serpapi.mjs     SerpApi Google Flights 클라이언트
  lib/search.mjs      응답 정규화 + 시간대·직항·항공사 재확인
  lib/analyze.mjs     "비싼 이유" 산출 · 히트맵 분위수
  lib/holidays.mjs    한·일 공휴일 / 성수기 테이블 (2026-2027)
  scripts/collect.mjs Actions 용 수집기
  scripts/make-sample.mjs  예시 데이터 생성기
  worker/worker.js    Cloudflare Worker 프록시
  data/prices.json    수집 결과 (현재는 예시 데이터)
```

`lib/` 는 브라우저 · Node · Worker 가 **같은 파일을 공유**합니다. 노선을 추가하거나
시간대 기본값을 바꾸려면 `lib/config.mjs` 한 곳만 고치면 됩니다.
다른 공급자로 갈아탈 일이 또 생기면 `lib/serpapi.mjs` 와 `lib/search.mjs` 의
정규화 함수만 바꾸면 나머지는 그대로 씁니다.

## "비싼 이유"에 쓰는 근거

- **구글 기준 시세 판정** — `price_insights` 의 `price_level`(low/typical/high)과
  통상 가격대. 같은 노선 과거 가격과 비교한 값입니다.
- **한·일 공휴일 / 성수기** — `lib/holidays.mjs` 표 (벚꽃·골든위크·오봉·단풍·연말연시)
- **노선 평균 대비 편차** — 수집 구간 안에서의 중앙값 비교
- **일정 프리미엄** — 같은 주 토·일(1박2일) 대비
- **출발 임박도** — D-21 이내
- **이코노미↔비즈니스 배수** — 노선 평소 배수보다 좁으면 `비즈니스 가성비` 배지
- **지연 잦은 편** — 구글이 30분 이상 지연이 잦다고 표시한 항공편

## 알아둘 점

- 표시 가격은 조회 시점의 참고값입니다. 유류할증료·수수료 정책과 좌석 재고가
  실시간으로 바뀌므로 **실제 결제 금액은 예매 화면에서 확인**하세요.
- **잔여석과 예약클래스(Y/N/Z)는 표시하지 않습니다.** Amadeus 시절에는 있었지만
  Google Flights 계열 데이터에는 그 항목이 없습니다.
- 공휴일 표는 사람이 관리합니다(`lib/holidays.mjs`). 대체공휴일은 정부 공고로
  바뀔 수 있으니 시즌마다 한 번 확인하세요.
- `비즈니스 가성비` 배지는 그 노선의 **수집 구간 내** 배수 중앙값과 비교한 상대값입니다.
  수집 범위가 좁으면 기준도 좁아지니 참고용으로만 보세요.
- 에어서울(RS)·에어부산(BX)은 요청대로 제외했습니다. 포함하려면
  `lib/config.mjs` 의 `DEFAULTS.carriers` 에 코드를 추가하세요.
