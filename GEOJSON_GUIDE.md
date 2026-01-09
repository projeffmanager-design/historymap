# GeoJSON 다운로드 및 Import 가이드

## 📥 1단계: GeoJSON 파일 다운로드

### 중국 행정구역 (추천)

**옵션 A: 간소화 버전 (빠른 로딩)**
```bash
mkdir -p data
cd data
curl -o china-simple.json "https://raw.githubusercontent.com/pyecharts/pyecharts-assets/master/assets/maps/china.json"
```

**옵션 B: 상세 버전**
```bash
curl -o china-detailed.json "https://raw.githubusercontent.com/longwosion/geojson-map-china/master/geometryProvince/china.json"
```

**옵션 C: 각 성별 개별 파일**
- 방문: https://github.com/longwosion/geojson-map-china
- `geometryProvince` 폴더에서 필요한 성 다운로드
- 예: `河北省.json`, `山东省.json` 등

### 한국 행정구역

**옵션 A: 시도 경계 (GeoJSON)**
```bash
curl -o korea-provinces.json "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea-provinces-2013-geo.json"
```

**옵션 B: 시군구 경계**
```bash
curl -o korea-municipalities.json "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea-municipalities-2013-geo.json"
```

### 기타 지역

**Natural Earth Data (전세계)**
```bash
# 저해상도 (10m)
curl -o world-countries.json "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"

# 고해상도 (50m)
curl -o world-countries-detailed.json "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
```

---

## 🔧 2단계: Import 실행

### 기본 사용법
```bash
node scripts/import_geojson_file.js data/china-simple.json
```

### 고급 옵션

**이름 필드 지정 (파일마다 다름)**
```bash
# 중국 (name 필드 사용)
node scripts/import_geojson_file.js data/china-simple.json --name-field name

# 한국 (NAME_1 필드 사용)
node scripts/import_geojson_file.js data/korea-provinces.json --name-field NAME_1

# Natural Earth (NAME 필드 사용)
node scripts/import_geojson_file.js data/world-countries.json --name-field NAME
```

**시작 연도 설정**
```bash
# 중국 (기원전 2000년부터)
node scripts/import_geojson_file.js data/china-simple.json --start-year -2000

# 한국 (고조선 시대부터)
node scripts/import_geojson_file.js data/korea-provinces.json --start-year -2333
```

**이름 접두사 추가**
```bash
# 중국 성 앞에 "중국 " 추가
node scripts/import_geojson_file.js data/china-simple.json --prefix "중국 "

# 한국 도 앞에 "조선 " 추가
node scripts/import_geojson_file.js data/korea-provinces.json --prefix "조선 "
```

---

## 📊 3단계: 확인

### 서버 실행
```bash
node server.js
```

### 브라우저에서 확인
1. http://localhost:3000 열기
2. **"영토"** 버튼 클릭
3. 연도 슬라이더 이동하면서 색상 변화 확인

---

## 🔍 GeoJSON 파일 구조 확인

파일의 이름 필드를 모르겠다면:

```bash
# 첫 번째 feature의 properties 확인
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('data/your-file.json')); console.log(data.features[0].properties)"
```

---

## 💡 추천 조합

### 동아시아 역사 지도용
```bash
# 1. 중국 행정구역 (간소화)
curl -o data/china.json "https://raw.githubusercontent.com/pyecharts/pyecharts-assets/master/assets/maps/china.json"
node scripts/import_geojson_file.js data/china.json --start-year -2000 --prefix "중국 "

# 2. 한국 행정구역
curl -o data/korea.json "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea-provinces-2013-geo.json"
node scripts/import_geojson_file.js data/korea.json --start-year -2333 --name-field NAME_1
```

---

## ⚠️ 주의사항

1. **파일 크기**: 상세 버전은 파일이 클 수 있습니다 (수 MB~수십 MB)
2. **로딩 속도**: 너무 상세한 경계선은 브라우저 렌더링이 느려질 수 있습니다
3. **좌표계**: 대부분 WGS84 (경도/위도) 사용
4. **중복 import**: 실행할 때마다 기존 데이터를 삭제하고 새로 추가합니다

---

## 🐛 문제 해결

### "지원하지 않는 GeoJSON 형식" 오류
→ 파일이 TopoJSON일 수 있습니다. GeoJSON 버전을 다운로드하세요.

### "이름을 찾을 수 없음" 오류
→ `--name-field` 옵션으로 올바른 필드명을 지정하세요.

### 영토가 표시되지 않음
→ 콘솔에서 "지배 국가: null" 확인 → 해당 지역에 마커가 없어서 색상이 할당되지 않은 것입니다.

---

## 🔗 추가 리소스

- Natural Earth Data: https://www.naturalearthdata.com/
- GADM (전세계 행정구역): https://gadm.org/
- GitHub GeoJSON 저장소: https://github.com/topics/geojson
