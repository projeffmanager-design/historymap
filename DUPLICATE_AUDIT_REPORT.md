# Duplicate Audit Report

작성일: 2026-07-10

## 요약

현재 `index.html`은 레거시 단일 파일 앱으로 동작하면서, 문서 끝에서 `./src/core/bootstrap.js`를 추가로 로드한다.

```html
<script type="module" src="./src/core/bootstrap.js?v=20260710-hero-layer-sync"></script>
```

따라서 `src` 리팩터링 코드는 별도 진입점으로 대체된 상태가 아니라, 레거시 `index.html` 위에 얹혀 실행된다. 이 구조에서는 `src` 모듈이 `window.someFunction = ...` 형태로 같은 이름을 다시 등록하면, 이미 `index.html`에 있던 레거시 함수가 덮어써진다.

핵심 결론은 다음과 같다.

- `src`는 현재 독립 앱 진입점이 아니다.
- `index.html`과 `src` 사이에 실제 런타임 중복이 많다.
- 일부 `src` 모듈은 레거시 구현보다 기능이 적거나 TODO stub이어서, 로드되는 순간 기존 기능을 깨뜨릴 수 있다.
- 지금 상태에서 리팩터링의 의미는 “분리 완료”가 아니라 “일부 기능을 복사해 둔 중간 상태”에 가깝다.

## 위험도 높음

### 1. Entity in-memory store 중복

중복 대상:

- `updateCastleInMemory`
- `addCastleInMemory`
- `deleteCastleInMemory`
- `updateCountryInMemory`
- `addCountryInMemory`
- `deleteCountryInMemory`
- `updateEventInMemory`
- `addEventInMemory`
- `deleteEventInMemory`
- `addKingInMemory`
- `updateDrawingInMemory`
- `addDrawingInMemory`
- `deleteDrawingInMemory`
- `addNaturalFeatureInMemory`
- `deleteNaturalFeatureInMemory`

위 함수들은 `index.html`에도 있고, `src/modules/entities/*-store.js`에도 있다.

레거시 `index.html` 구현은 실제 전역 배열, 캐시, 지도 갱신, 드롭다운 갱신 같은 부수효과를 포함한다. 반면 `src/modules/entities/*-store.js` 구현은 `src/core/state.js`의 별도 `state` 객체만 변경한다.

현재 앱의 실제 데이터 소스는 대부분 레거시 전역 배열이므로, `src` 버전이 `window`에 다시 할당되면 저장 직후 UI 갱신, 지도 갱신, 캐시 갱신이 누락될 가능성이 높다.

판정: 치명적 중복. 지금 구조에서는 `src` 버전을 로드하지 않거나, 레거시 전역 상태와 완전히 연결하기 전까지 `window`에 등록하면 안 된다.

### 2. Contributions moderation 중복

중복 대상:

- `approveContribution`
- `revertContribution`

`index.html`의 레거시 구현은 실제 승인/되돌리기 처리를 수행한다. 반면 `src/modules/contributions/moderation.js`는 TODO 성격의 stub에 가깝다.

현재처럼 `bootstrap.js`가 후순위로 로드되면 `src`의 stub이 레거시 함수를 덮어쓸 수 있다.

판정: 치명적 중복. 승인/되돌리기 기능이 직접 깨질 수 있다.

### 3. Contributions voting/comments 중복

중복 대상:

- `voteContribution`
- `openMarkerCommentModal`

`index.html`의 구현은 투표 후 팝업/모달/투표자 목록/알림 등 UI 연동이 포함되어 있다. `src/modules/contributions/voting.js`와 `comments.js`의 구현은 기능 범위가 더 작다.

판정: 높음. 단순 API 호출만 남고 레거시 UI 흐름이 빠질 수 있다.

### 4. 3D map mode 중복

중복 대상:

- `enter3d`
- `exit3d`
- `_is3dMode`

`index.html`의 구현은 MapLibre 3D, 지도 레이어, 마커, 궁궐 편집 UI 등 실제 화면 전환을 포함한다. `src/modules/map/three-d.js`는 `_is3dMode` 값을 바꾸는 최소 구현에 가깝다.

판정: 높음. 3D 모드 진입/종료 UI가 깨질 가능성이 크다.

## 위험도 중간

### 5. History caption panel 중복

중복 대상:

- `toggleHistoryCaption`
- `_historyCaptionVisible`

`src/modules/history/caption-panel.js`는 표시/숨김 정도의 단순 구현이다. 레거시 구현이 더 많은 상태나 렌더링 흐름과 연결되어 있다면 기능 축소가 발생할 수 있다.

판정: 중간. 현재 기능 범위 확인 후 한쪽만 남겨야 한다.

### 6. Media upload/lightbox 중복

중복 대상:

- `openLightbox`
- `closeLightbox`
- `_lightboxKeyHandler`
- `uploadGeneralPhoto`
- `_previewGeneralPhoto`
- `uploadCastlePhoto`
- `uploadCastlePhotoFromUrl`
- `loadCastleVoiceSection`
- `castleFormUploadVoice`
- `castleFormDeleteVoice`

`src/modules/media/*`는 레거시 코드와 거의 같은 복사본으로 보인다. 즉각적인 기능 손상 위험은 낮을 수 있지만, 같은 버그를 두 곳에서 고쳐야 하는 상태다.

판정: 중간. 기능 소유권을 한쪽으로 정해야 한다.

### 7. Hero layer/bootstrap 중복

중복 대상:

- `__codexClearHeroCache`
- `__codexForceHeroPins`
- `__codexSetHeroLayerVisible`
- `darken`
- `getOverlapShiftPx`
- `getShiftedHeroLatLng`
- `isCapitalLikeCastle`
- `getCountryInfo`
- `getKingByYear`
- `yearMonthToTotalMonths`

`index.html`에는 기존 hero system이 있고, `src/core/bootstrap.js`에는 hero pin layer 보정 코드가 있다. 일부는 공존을 의도한 것으로 보이지만, 레이어 소유권이 분산되어 있다.

판정: 중간. 의도된 override인지, 임시 patch인지 결정해야 한다.

## 위험도 낮음

### 8. Shared utility 중복

중복 대상:

- `getToken`
- `authHeader`
- `getMap`
- `getCurrentYearMonth`

이름은 중복되지만 일부는 모듈 내부 helper라서 직접 `window`를 덮어쓰지 않는다. 다만 같은 유틸이 여러 곳에 복사되어 있어 향후 수정 누락 가능성이 있다.

판정: 낮음. 정리 우선순위는 낮지만 최종 리팩터링 단계에서는 공용 모듈로 모으는 것이 좋다.

## 현재 구조 판단

현재 구조는 다음 중 어느 쪽도 완성되어 있지 않다.

1. `index.html`만 사용하는 레거시 구조
2. `src/core/bootstrap.js`를 진입점으로 사용하는 리팩터링 구조

실제 상태는 “레거시 `index.html` + 후순위 `src` monkey patch” 구조다. 이 방식은 임시 보정에는 쓸 수 있지만, 큰 기능 리팩터링에는 위험하다. 특히 `src`가 `window`에 같은 이름을 다시 할당하는 순간, 레거시 기능이 조용히 교체된다.

## 권장 정리 플랜

### 1단계: 긴급 안정화

- `index.html`의 `src/core/bootstrap.js` 로드를 잠시 제거하거나, `bootstrap.js`가 hero 관련 patch만 수행하도록 제한한다.
- `src/modules/entities`, `src/modules/contributions`, `src/modules/map/three-d`, `src/modules/history`가 자동으로 `window` 함수를 덮어쓰지 않게 한다.
- 모바일 국가명 입력 버그는 현재 실제 실행 경로인 `index.html` 쪽에서 먼저 수정한다.

### 2단계: 소유권 결정

각 기능별로 소유권을 하나만 정한다.

- 당장 운영 안정성이 우선이면 `index.html`을 source of truth로 둔다.
- 리팩터링을 계속할 계획이면 `src`를 source of truth로 삼되, 레거시 함수와 완전히 동등한 기능을 옮긴 뒤 하나씩 연결한다.

### 3단계: 중복 제거 순서

추천 순서:

1. Contributions stub 제거 또는 레거시 구현 이관
2. Entity store를 레거시 전역 상태와 연결하거나, 레거시 호출부 전체를 `state` 기반으로 이전
3. 3D map mode 전체 이관
4. Media/lightbox 복사본 정리
5. Hero layer 소유권 정리
6. Shared utility 공용화

### 4단계: 안전장치 추가

- `bootstrap.js`에서 `window`에 함수를 등록할 때 기존 함수가 있으면 경고를 출력하도록 한다.
- 중요한 전역 함수 목록에 대해 중복 등록 검사 스크립트를 추가한다.
- 리팩터링 중에는 한 기능을 옮길 때마다 실제 UI smoke test를 한다.

## 결론

지금 상태에서 `src` 리팩터링은 아직 앱의 주 실행 구조가 아니다. 오히려 일부 `src` 코드가 레거시 `index.html`의 정상 기능을 덮어쓸 수 있는 위험한 중간 상태다.

가장 안전한 다음 액션은 `src` 자동 override를 막고, 운영 중인 실제 실행 경로인 `index.html` 기준으로 모바일 입력 버그를 먼저 고치는 것이다. 이후 기능 단위로 `index.html -> src` 이관을 다시 진행하는 것이 맞다.

## 조치 기록

2026-07-10 기준으로 중복 `src` 모듈의 런타임 실행 경로를 제거했다.

- `src/core/bootstrap.js`에서 `register*Modules()` import와 `bootModules()` 호출을 제거했다.
- `src/modules/*`, `src/shared/*`, `src/core/state.js`를 삭제했다.
- 현재 `src`에는 `src/core/bootstrap.js`와 `src/styles/app.css`만 남아 있다.
- 남은 `bootstrap.js`는 hero renderer 보정만 수행한다.

검증:

- `rg`로 주요 레거시 전역 함수 override 패턴을 검색했으며 남은 중복 등록은 발견되지 않았다.
- `node --check src/core/bootstrap.js` 문법 검사를 통과했다.
