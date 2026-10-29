# historymap

## 로컬 지도 미리보기

```sh
npm run preview:map
```

야간 모드: <http://127.0.0.1:3001/?basemap=night>

현재 작업 폴더의 화면·스크립트를 제공하고 공개 지도 데이터만 읽어옵니다.
DB 연결 설정 없이 실행할 수 있으며, 미리보기에서 저장 요청은 차단됩니다.
종료 후 같은 명령으로 다시 실행할 수 있습니다. 다른 포트는 `PREVIEW_PORT=3002 npm run preview:map`으로 지정합니다.

야간 불빛은 NASA VIIRS 2012 관측 영상이며, 연도 슬라이더는 역사 마커와 영토에 적용됩니다.
