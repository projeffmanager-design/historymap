# 영토 증분 추가 가이드 (Incremental Territory Update)

## 🎯 목적
전체 타일을 재생성하지 않고 새로운 영토만 기존 타일에 추가하여 시간을 절약합니다.

---

## 📋 기존 방식 (느림 ❌)
```bash
# 1단계: 영토 추가
node scripts/add_new_territories.js

# 2단계: 전체 타일 재생성 (91개 영토 × 199개 타일)
node scripts/regenerate_all_tiles.js  # ⏰ 1-2분 소요

# 3단계: 전체 타일 export
node scripts/export_tiles_batch.js    # ⏰ 1-2분 소요
```

**문제점**: 영토 1개 추가해도 전체 91개를 다시 처리 → 느림

---

## 🚀 새로운 방식 (빠름 ✅)

### 1단계: 영토를 DB에 추가
```javascript
// scripts/add_specific_territory.js 생성
const newTerritory = {
    name: 'Taklamakan Desert',
    name_ko: '타클라마칸 사막',
    name_type: 'Taklamakan Desert',
    type: 'admin_area',
    level: 'region',
    start: -3000,
    end: 3000,
    geojson: {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [77.0, 41.5],
                [90.0, 41.5],
                [90.0, 37.0],
                [77.0, 37.0],
                [77.0, 41.5]
            ]]
        }
    }
};

// DB에 insert
await territoriesCollection.insertOne(newTerritory);
```

### 2단계: 새 영토만 타일에 추가 (증분 업데이트)
```bash
# 특정 영토만 타일에 추가
node scripts/add_territory_to_tiles.js "Taklamakan Desert" "Tibet"

# 결과:
# 📍 추가할 영토: 2개
# 🗺️ 처리 중: Taklamakan Desert
#   📦 겹치는 타일: 12개
#   ✅ 12개 타일 업데이트됨
# 🗺️ 처리 중: Tibet
#   📦 겹치는 타일: 18개
#   ✅ 18개 타일 업데이트됨
# ✅ 완료! 업데이트된 타일: 30개
```

⏰ **소요 시간**: 1-2초 (전체 영토 재처리 없음!)

### 3단계: 변경된 타일만 export
```bash
# 옵션 1: 특정 타일만 export
node scripts/export_specific_tiles.js tile_30_70 tile_30_80 tile_40_70

# 옵션 2: 전체 export (index.json 업데이트 위해)
node scripts/export_specific_tiles.js
```

⏰ **소요 시간**: 
- 특정 타일만: 1초 미만
- 전체 타일: 30-40초 (하지만 증분 업데이트 후라 빠름)

---

## 🔄 워크플로우 비교

### 기존 (전체 재생성)
```
영토 추가 → 전체 재생성 (2분) → 전체 export (2분) = 총 4분+
```

### 신규 (증분 업데이트)
```
영토 추가 → 증분 타일 업데이트 (2초) → 선택적 export (1-40초) = 총 3-42초
```

**시간 절약**: 약 **80-90% 단축** ⚡

---

## 💡 실전 예시

### 예시 1: 영토 1개 추가
```bash
# 1. 영토를 DB에 추가 (직접 또는 스크립트)
# 2. 타일 업데이트
node scripts/add_territory_to_tiles.js "New Territory"

# 3. Export (전체)
node scripts/export_specific_tiles.js
```

### 예시 2: 영토 여러 개 추가
```bash
# 한 번에 여러 영토 추가
node scripts/add_territory_to_tiles.js "Territory A" "Territory B" "Territory C"

# Export
node scripts/export_specific_tiles.js
```

### 예시 3: 영토 수정 (geometry 변경)
```bash
# DB에서 수정 후
node scripts/add_territory_to_tiles.js "Modified Territory"

# 해당 타일만 export
node scripts/export_specific_tiles.js tile_30_120 tile_40_120
```

---

## 🛠️ 스크립트 정리

| 스크립트 | 용도 | 속도 |
|---------|-----|------|
| `regenerate_all_tiles.js` | 전체 타일 재생성 | 느림 (1-2분) |
| `export_tiles_batch.js` | 전체 타일 export | 느림 (1-2분) |
| `add_territory_to_tiles.js` | 특정 영토만 타일에 추가 | 빠름 (1-2초) |
| `export_specific_tiles.js` | 특정/전체 타일 export | 빠름 (1-40초) |

---

## ⚠️ 주의사항

1. **geometry 형식**: GeoJSON Feature 형식이어야 함
   ```javascript
   geojson: {
       type: 'Feature',
       geometry: {
           type: 'Polygon',
           coordinates: [...]
       }
   }
   ```

2. **name_type 필수**: 영토 식별자로 사용됨

3. **index.json 업데이트**: 
   - 새 영토 추가 시 반드시 `export_specific_tiles.js` 전체 실행
   - 프론트엔드가 index.json을 참조함

4. **브라우저 캐시**: Export 후 Hard Refresh (Cmd+Shift+R)

---

## 🎉 결론

이제 영토를 추가할 때:
- ✅ 전체 재생성 없음
- ✅ 변경된 타일만 업데이트
- ✅ 시간 80-90% 단축
- ✅ 기존 영토 안전하게 보존
