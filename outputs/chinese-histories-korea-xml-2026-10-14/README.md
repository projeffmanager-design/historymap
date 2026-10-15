# 중국 정사 한국 관련 기사 DB 반영

2026-10-14에 MongoDB `realhistory.source_records`에 **2,282건을 실제 추가**했고, 삽입 ID를 대상으로 독립적인 DB 집계를 실행해 **2,282건 전부 본문이 존재함**을 확인했다. 기존 기록은 수정하거나 삭제하지 않았다.

- 자료: 국사편찬위원회 [한국고대사료집성 중국편 공식 XML](https://www.data.go.kr/data/15053631/fileData.do)
- 범위: 사기부터 신오대사까지 19종 중국 정사의 한국 관련 기사
- 원본 추출: 4,414건
- 기존 중복으로 건너뜀: 2,132건
- 신규 추가: 2,282건 = 날짜 명시 4건 + 연도 미상 2,278건
- 날짜는 XML의 `dateOccured`만 사용했다. 연도 미상 기사는 `year: null`이며 연도를 추정하지 않았다.
- 인명·국명 등 XML 인라인 요소의 텍스트를 보존했고, 본문과 편집자 주석을 구별했다.
- 각 기사에 공식 `source_id`, `source_url`, 사서명, 권·편명, 원문, 날짜 근거를 저장했다.

연도 미상 기사는 수정된 역사 패널의 **연도 미상** 버튼이나 전체 시대 검색으로 열람한다. 화면 변경은 이 작업 디렉터리에 있으며 아직 배포하지 않았다.

`import-summary.json`은 실제 DB 검증 결과이며 `insertion-plan.json`은 추가한 모든 ID와 출처 목록이다. `records.jsonl`은 재생성 가능한 전체 추출 본문으로 로컬에 보존하며 Git에서는 제외했다.

## 남은 범위

2026-10-15 후속 작업으로 **원사 한국 관련 기사 61건(원문·국역)을 추가하고 DB 재조회 검증을 완료**했다. 자세한 내역은 [원사 반영 보고서](../chinese-histories-korea-yuan-2026-10-15/README.md)에 있다. 아래 내용은 최초 수집 당시의 중단 상태를 기록한 것이다.

『중국정사조선전』의 한국 관련 기사 1,062건 목록을 별도로 확보했다. 송사·요사·금사·원사·신원사·명사·청사고를 포함한 원문·국역 전체 수집은 공식 서버 연결 타임아웃으로 완료하지 못했다. 27건의 원문·국역 응답과 나머지 기사 목록은 `../chinese-histories-korea-2026-10-14/`에 보존했으며 이 국역 자료는 아직 DB에 넣지 않았다. 따라서 **25사 전체 수집 완료를 뜻하지 않는다.**

공식 서버 연결이 회복되면 다음 명령으로 캐시를 재사용해 수집을 이어갈 수 있다.

```sh
python3 scripts/collect-chinese-histories-korea.py --output outputs/chinese-histories-korea-2026-10-14
node scripts/import-chinese-histories-korea.js --input=outputs/chinese-histories-korea-2026-10-14/records.jsonl --env=/path/to/.env
node scripts/import-chinese-histories-korea.js --input=outputs/chinese-histories-korea-2026-10-14/records.jsonl --env=/path/to/.env --apply
```

검증: 관련 Node 테스트 35개와 Python 수집기 테스트 3개 통과. 실제 운영 화면은 배포 전이므로 확인하지 않았다.
