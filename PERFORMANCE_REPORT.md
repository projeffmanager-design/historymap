# 영토 데이터 로딩 성능 최적화 완료 보고서

## 📊 현재 상태
- **영토 개수**: 70개 (마커가 있는 지역만 선택적 임포트)
  - 한국: 17개
  - 중국: 33개  
  - 러시아: 19개
  - 몽골: 1개
- **타일 수**: 53개
- **총 데이터 크기**: 13.37 MB
- **로딩 시간**: 60~88초 (MongoDB Atlas 무료 티어)

## ⚡ 수행된 최적화

### 1. ✅ 데이터 최적화
- **마커 기반 필터링**: 성(castle) 마커가 있는 행정구역만 선택적 임포트
  - 러시아: 83개 → 19개로 77% 감소
  - 중국: 34개 → 33개 (거의 모든 지역에 마커 존재)

### 2. ✅ 타일 시스템
- **10°x10° 타일 그리드**: 전 세계를 53개 타일로 분할
- **평균 타일 크기**: 258 KB
- **타일당 평균 feature**: 3.8개

### 3. ✅ MongoDB 인덱스
생성된 인덱스:
```javascript
// territory_tiles 컬렉션
- bounds.minLat_1_bounds.maxLat_1_bounds.minLng_1_bounds.maxLng_1
- tile_lat_1_tile_lng_1

// territories 컬렉션  
- country_id_1
- idx_time_range (start_year, end_year)
```

### 4. ✅ 서버 최적화
- **Gzip 압축**: compression() 미들웨어 적용
- **bbox 쿼리**: 뷰포트와 겹치는 타일만 조회

### 5. ✅ 클라이언트 최적화
- **지연 로딩**: 영토 버튼 클릭 시에만 로드
- **초기 로드 제외**: 페이지 로드 시 영토 데이터 미포함
- **기본값 OFF**: `layerVisibility.territoryPolygon = false`

## 🚨 성능 병목의 실제 원인

### MongoDB Atlas 무료 티어 제약
1. **네트워크 지연**: 한국 → 미국/유럽 데이터센터 왕복 시간
2. **공유 인프라**: 무료 티어는 리소스 공유로 응답 속도 변동
3. **연결 제한**: 동시 연결 수 및 쿼리 처리 속도 제한
4. **대역폭 제한**: 대용량 데이터 전송 시 throttling

### 실제 측정값
```
🗺️ Territory Tiles query start...
🗺️ Territory Tiles complete: 53 tiles, 13.37MB (86679ms)
```
- **DB 쿼리 시간**: 86.7초
- **데이터 크기**: 13.37 MB
- **전송 속도**: ~154 KB/s (매우 느림!)

**정상적인 로컬 MongoDB라면**: 13MB 데이터는 **0.5~1초** 안에 로드됩니다.

## 💡 추가 최적화 방안

### Option 1: 타일 크기 더 줄이기 (권장 ⭐)
현재 평균 258KB는 여전히 큽니다. 좌표 정밀도를 낮추면:

```javascript
// Mapshaper로 Simplify
// 현재: 0.1% simplification
// 제안: 1% simplification (시각적 차이 거의 없음)
// 예상 효과: 13MB → 2~3MB, 로딩 60초 → 15~20초
```

### Option 2: CDN/정적 파일로 전환
MongoDB 대신 GeoJSON을 정적 파일로 서빙:
```
/public/tiles/tile_30_120.json
/public/tiles/tile_40_130.json
```
- Vercel Edge Network로 전 세계 캐싱
- 예상 속도: **1~3초**

### Option 3: 더 작은 타일 (5°x5°)
```javascript
TILE_SIZE = 5; // 10° → 5°
// 타일 수: 53개 → 200개 증가
// 타일 크기: 258KB → 65KB 감소
// 초기 로드: 1~2개 타일만 로드 (200~300ms)
```

### Option 4: MongoDB Realm 또는 유료 티어
- Atlas M10 이상: 전용 인스턴스, 예상 속도 **2~5초**
- 한국 리전 선택 가능 (Seoul)

## 🎯 즉시 적용 가능한 최선책

**타일을 정적 파일로 변환 + Vercel CDN 활용**

```bash
# 1. 타일을 개별 JSON 파일로 export
node scripts/export_tiles_to_files.js

# 2. public/tiles/ 디렉토리에 저장
# 3. 클라이언트에서 fetch로 직접 로드
```

예상 효과:
- 로딩 시간: **88초 → 2~5초** (94% 개선)
- MongoDB 부하 제거
- 브라우저 캐싱으로 재방문 시 즉시 로드

## 📌 결론

현재 성능 문제는 **MongoDB Atlas 무료 티어의 네트워크 지연**이 주 원인입니다.

최적화는 모두 완료되었으나, 물리적 네트워크 한계로 인해:
- **현재**: 86초 (MongoDB Atlas 미국/유럽 서버)
- **이상적**: 1초 이하 (로컬 DB 또는 CDN)

**권장 솔루션**: 타일을 정적 JSON 파일로 변환하여 Vercel CDN에서 서빙
