# 한화 견적서(Numbers) 생성 도구

이 세션(https://claude.ai/code/session_012796WnZmJbX9FuSQEidAN1)에서 만든 스크립트. `numbers-parser` 라이브러리로 넘버스 파일을 직접 읽고 씁니다.

## 준비
```bash
pip install numbers-parser "protobuf>=7.36.2" openpyxl
```
작업 디렉터리에 `work/` 폴더를 만들고 `data/*.json`을 `work/`로 복사한 뒤 실행합니다 (스크립트는 `work/hive*.json` 경로를 사용).

## 파일
| 파일 | 역할 |
|---|---|
| `extract.py` | HIVE 엑셀 견적서에서 1~10번 항목을 `work/hive.json`으로 추출 |
| `modify.py` | 문구 변경 + 단가 3~8% 인상, 목표 Cost 합계에 맞춰 정규화 → `work/hive_mod.json` (v3 데이터) |
| `desc_alt.py` | Description 열만 다른 표현으로 바꾼 변형 데이터 → `work/hive_mod_desc.json` |
| `wacker_spec.py` | 웨커 방식(PLANNING / PRODUCTION / VENUE / PROGRAM / OPERATION)으로 재구성한 항목 정의 + 공통 단가표 → `work/hive_wacker.json` |
| `build2.py` | 베이스 넘버스 파일 위에 섹션·합계표·취소 정책을 다시 생성 (수식, 병합, 테두리, 셀 서식/통화 셀 타입 복사) |
| `verify2.py` | 생성 파일의 구조·수식·금액 검증 |
| `diff.py` | 두 넘버스 파일을 셀 단위로 비교 (값/서식/테두리/병합) |

## 실행 예
```bash
# 베이스: 직접 서식을 고친 넘버스 파일 (user_v2.numbers)
python3 build2.py base.numbers "out/WACKER (HANWHA) QUOTATION_v3.numbers" work/hive_mod.json
python3 build2.py base.numbers "out/WACKER (HANWHA) QUOTATION_wacker.numbers" work/hive_wacker.json
python3 verify2.py "out/WACKER (HANWHA) QUOTATION_wacker.numbers" work/hive_wacker.json
```

## 주의
- `build2.py`는 베이스 파일의 1번 섹션(시그니처 위크) 행들을 서식 템플릿으로 사용합니다. 1번 섹션 구조(제목 → 헤더 → 항목 → Sub Total → Cost Total → 빈 행)를 유지해야 합니다.
- `hive_wacker.json`처럼 첫 섹션에 `"regenerate": true`가 있으면 1번 섹션까지 전부 다시 생성하고, 없으면 1번은 제자리에서 값만 바꿉니다.
- 소계/Cost Total 셀은 원본과 같은 "통화 셀" 타입으로 써야 넘버스에서 회계 서식이 적용됩니다 (`apply_snap`에서 처리).
