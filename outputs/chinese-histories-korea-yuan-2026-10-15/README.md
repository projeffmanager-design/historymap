# 원사 한국 관련 기사 DB 반영

2026-10-15에 MongoDB `realhistory.source_records`에 **원사(元史) 한국 관련 기사 61건을 실제 추가**했다. 국사편찬위원회 [중국정사조선전 원사 외이열전](https://db.history.go.kr/ancient/level.do?levelId=jo_021r)에 수록된 고려 기사 57건과 탐라 기사 4건이다. 신원사는 이번 추가 범위에 포함하지 않았다.

- 공식 기사 목록 61건과 수집 본문 61건의 ID가 모두 일치한다.
- 한문 원문과 공식 국역, 사서·편명, 국가명, 공식 출처 URL을 함께 저장했다.
- 제목에 명시된 연도가 있는 57건은 1218~1301년에 연결했다.
- 연도 미상 4건에 임의의 연도를 붙이지 않았다.
- 월이 명시된 51건은 월도 저장했으며 정월은 1월로 정규화했다. 윤달 기사 2건에는 `is_leap_month: true`를 보존했다.
- 기존 원사 자료 0건, 중복 0건, 신규 삽입 61건.
- 기존의 다른 사료나 인물 자료는 수정하지 않았다.

삽입 후 별도의 DB 조회로 **61건 전체의 원문·국역·연도·월·윤달·출처·표시 본문이 수집 결과와 정확히 일치함**을 확인했다. `database-verification.json`에 검증 결과와 수집 파일의 SHA-256을 저장했다.

`import-summary.json`은 실제 삽입 결과이며, `insertion-plan.json`은 삽입한 ID 목록이다. `records.jsonl`, `manifest.json`, 공식 응답 캐시는 로컬에 보존하고 Git에서는 제외한다.

수집기를 다시 사용할 때는 다음처럼 원사만 선택할 수 있다.

```sh
python3 scripts/collect-chinese-histories-korea.py --book=jo_021 --workers=1 --output outputs/chinese-histories-korea-yuan-2026-10-15
```

수집기 테스트 4개와 관련 Node 테스트 10개를 통과했다. 이번 작업은 DB 자료 반영이며 웹 코드 배포는 수행하지 않았다.
