# 🗺️ Korea History Map - 시스템 명세서

## 📋 프로젝트 개요

**프로젝트명**: Korea History Map (역사 지도 시각화 시스템)  
**목적**: 한국 및 동아시아 역사의 영토, 국가, 도시, 인물을 시간 기반으로 시각화하는 인터랙티브 웹 애플리케이션  
**배포**: Vercel (프론트엔드), MongoDB Atlas (데이터베이스)  
**버전**: 2026.01 (최신 업데이트)

---

## 🏗️ 시스템 아키텍처

### 기술 스택

#### Frontend
- **HTML5/CSS3/JavaScript (Vanilla)**
- **Leaflet.js** - 지도 라이브러리
- **Chart.js** - 통계 차트
- **D3.js** (부분 사용) - 데이터 시각화

#### Backend
- **Node.js** (v18+)
- **Express.js** - RESTful API 서버
- **MongoDB** - NoSQL 데이터베이스 (MongoDB Atlas)

#### 인증 & 보안
- **JWT (JSON Web Token)** - 사용자 인증
- **bcrypt** - 비밀번호 암호화
- **CORS** - Cross-Origin 리소스 공유

#### 배포 & 호스팅
- **Vercel** - 프론트엔드 & API 호스팅
- **MongoDB Atlas** - 클라우드 데이터베이스
- **GitHub** - 버전 관리 & CI/CD

---

## 📊 데이터베이스 명세 (MongoDB)

### 데이터베이스명: `realhistory`

### 컬렉션 구조

#### 1. `castle` (성/도시)
도시, 성, 수도, 전투지, 자연 지형지물을 저장하는 메인 컬렉션

```javascript
{
  "_id": ObjectId,
  "name": String,              // 도시명 (예: "평양", "한양")
  "lat": Number,               // 위도 (WGS84)
  "lng": Number,               // 경도 (WGS84)
  "photo": String | null,      // 사진 URL
  "desc": String,              // 설명
  "is_capital": Boolean,       // 수도 여부
  "is_battle": Boolean,        // 전투지 여부
  "is_military_flag": Boolean, // 군기 표시 여부
  "is_natural_feature": Boolean, // 자연 지형지물 여부
  "is_label": Boolean,         // 라벨 텍스트 여부
  "label_type": String | null, // 라벨 타입 ("region", "sea", etc.)
  "label_color": String,       // 라벨 색상 (hex)
  "label_size": String,        // 라벨 크기 ("small", "medium", "large")
  "natural_feature_type": String | null, // 자연 지형 타입 ("mountain", "river")
  "custom_icon": String | null, // 커스텀 아이콘 URL
  "icon_width": Number | null,  // 아이콘 너비
  "icon_height": Number | null, // 아이콘 높이
  "history": Array,            // 시간별 역사 배열
  [
    {
      "name": String,          // 해당 시기 이름
      "country_id": String,    // 소속 국가 ID
      "start_year": Number,    // 시작 연도
      "start_month": Number,   // 시작 월
      "end_year": Number | null, // 종료 연도 (null = 현재까지)
      "end_month": Number,     // 종료 월
      "is_capital": Boolean,   // 해당 시기 수도 여부
      "is_battle": Boolean     // 해당 시기 전투 여부
    }
  ],
  "country_id": String,        // 기본 소속 국가 ID
  "built_year": Number,        // 건립 연도
  "built_month": Number,       // 건립 월
  "destroyed_year": Number | null, // 파괴 연도
  "destroyed_month": Number,   // 파괴 월
  "lastModifiedBy": String,    // 최종 수정자
  "path_data": Array           // 경로 데이터 (선 표시용)
}
```

**인덱스**:
- `{ name: 1 }`
- `{ "history.country_id": 1 }`
- `{ lat: 1, lng: 1 }`

**특징**:
- 시간에 따라 소속 국가가 변경되는 도시 관리
- 수도, 전투지, 자연 지형지물 등 다양한 타입 지원
- 라벨 표시 기능으로 지도 상 텍스트 표현 가능

---

#### 2. `countries` (국가)
역사적 국가 정보를 저장

```javascript
{
  "_id": ObjectId,
  "name": String,              // 국가명 (예: "고구려", "백제")
  "name_en": String,           // 영문명
  "name_cn": String,           // 한자명
  "color": String,             // 국가 색상 (hex)
  "start_year": Number,        // 건국 연도
  "start_month": Number,       // 건국 월
  "end_year": Number | null,   // 멸망 연도 (null = 현재까지)
  "end_month": Number,         // 멸망 월
  "capital": String,           // 수도명
  "desc": String,              // 설명
  "flag": String | null,       // 국기 URL
  "category": String,          // 카테고리 (예: "삼국시대", "고려")
  "territory_style": Object    // 영토 스타일
  {
    "fillColor": String,       // 채우기 색상
    "fillOpacity": Number,     // 투명도
    "weight": Number,          // 테두리 두께
    "color": String            // 테두리 색상
  }
}
```

**인덱스**:
- `{ name: 1 }`
- `{ start_year: 1, end_year: 1 }`

**특징**:
- 시작/종료 연월로 시간 범위 관리
- 지도 상 영토 표시 스타일 커스터마이징

---

#### 3. `territories` (영토 폴리곤)
국가별 영토 경계선을 GeoJSON 형식으로 저장

```javascript
{
  "_id": ObjectId,
  "name": String,              // 영토명 (예: "고구려 전성기")
  "name_en": String,           // 영문명
  "name_ko": String,           // 한글명
  "country_id": String,        // 소속 국가 ID
  "type": String,              // 타입 ("country", "admin_area", "historical")
  "admin_level": Number,       // 행정 레벨 (1-10)
  "geometry": Object,          // GeoJSON Geometry
  {
    "type": String,            // "Polygon", "MultiPolygon"
    "coordinates": Array       // [[[lng, lat], ...]]
  },
  "bbox": Array,               // Bounding Box [minLon, minLat, maxLon, maxLat]
  "start_year": Number,        // 시작 연도 (기본: -3000)
  "end_year": Number,          // 종료 연도 (기본: 3000)
  "start": Number,             // start_year 별칭
  "end": Number,               // end_year 별칭
  "properties": Object,        // 추가 속성
  "code": String | null,       // 코드 (예: "KR", "CN")
  "population": Number | null, // 인구
  "area": Number | null,       // 면적 (km²)
  "osm_id": String | null      // OpenStreetMap ID
}
```

**인덱스**:
- `{ name: 1 }`
- `{ country_id: 1 }`
- `{ start_year: 1, end_year: 1 }`
- `{ bbox: "2dsphere" }` - 지리공간 인덱스

**특징**:
- GeoJSON 표준 준수
- bbox 자동 계산으로 빠른 공간 쿼리
- 대용량 폴리곤 지원 (최대 50MB)

---

#### 4. `kings` (왕/군주)
역사적 군주 정보

```javascript
{
  "_id": ObjectId,
  "name": String,              // 이름 (예: "태조 왕건")
  "country_id": String,        // 소속 국가 ID
  "start_year": Number,        // 즉위 연도
  "start_month": Number,       // 즉위 월
  "end_year": Number | null,   // 퇴위 연도
  "end_month": Number,         // 퇴위 월
  "birth_year": Number | null, // 출생 연도
  "death_year": Number | null, // 사망 연도
  "temple_name": String,       // 묘호 (예: "태조")
  "posthumous_name": String,   // 시호
  "desc": String,              // 설명
  "achievements": Array,       // 업적 목록
  "photo": String | null       // 초상화 URL
}
```

**인덱스**:
- `{ country_id: 1 }`
- `{ start_year: 1 }`

---

#### 5. `general` (장군/인물)
역사적 인물 정보

```javascript
{
  "_id": ObjectId,
  "name": String,              // 이름
  "country_id": String,        // 소속 국가 ID
  "birth_year": Number | null, // 출생 연도
  "death_year": Number | null, // 사망 연도
  "role": String,              // 역할 ("general", "scholar", "politician")
  "desc": String,              // 설명
  "major_battles": Array,      // 주요 전투 목록
  "photo": String | null       // 초상화 URL
}
```

---

#### 6. `events` (역사 이벤트)
특정 시점의 역사적 사건

```javascript
{
  "_id": ObjectId,
  "title": String,             // 사건명 (예: "삼국통일")
  "year": Number,              // 발생 연도
  "month": Number,             // 발생 월
  "day": Number | null,        // 발생 일
  "desc": String,              // 설명
  "related_countries": Array,  // 관련 국가 ID 배열
  "related_castles": Array,    // 관련 도시 ID 배열
  "category": String,          // 카테고리 ("battle", "treaty", "reform")
  "importance": Number         // 중요도 (1-5)
}
```

**인덱스**:
- `{ year: 1, month: 1 }`
- `{ category: 1 }`

---

#### 7. `history` (통합 역사 타임라인)
시간순 역사 기록 (복합 컬렉션)

```javascript
{
  "_id": ObjectId,
  "type": String,              // 타입 ("castle", "country", "event", "king")
  "ref_id": String,            // 참조 문서 ID
  "year": Number,              // 연도
  "month": Number,             // 월
  "action": String,            // 행동 ("created", "updated", "destroyed")
  "desc": String,              // 설명
  "country_id": String | null  // 관련 국가 ID
}
```

**인덱스**:
- `{ year: 1, month: 1 }`
- `{ type: 1, ref_id: 1 }`

---

#### 8. `users` (사용자)
회원 정보 및 권한 관리

```javascript
{
  "_id": ObjectId,
  "username": String,          // 사용자명 (고유)
  "email": String,             // 이메일 (고유)
  "password": String,          // bcrypt 해시 비밀번호
  "role": String,              // 역할 ("user", "admin", "superuser")
  "created_at": Date,          // 가입일
  "last_login": Date | null,   // 최근 로그인
  "is_active": Boolean         // 활성 상태
}
```

**인덱스**:
- `{ username: 1 }` (unique)
- `{ email: 1 }` (unique)

**권한 레벨**:
- `user`: 일반 사용자 (읽기 전용)
- `admin`: 관리자 (편집 가능, 회원 관리)
- `superuser`: 최고 관리자 (모든 권한)

---

#### 9. `drawings` (그림 경로)
사용자가 지도에 그린 선/도형

```javascript
{
  "_id": ObjectId,
  "user_id": String,           // 작성자 ID
  "name": String,              // 그림 이름
  "type": String,              // 타입 ("line", "polygon", "circle")
  "coordinates": Array,        // 좌표 배열
  "color": String,             // 색상
  "weight": Number,            // 두께
  "created_at": Date,          // 생성일
  "is_public": Boolean         // 공개 여부
}
```

---

#### 10. `natural_features` (자연 지형지물)
산맥, 강, 호수 등

```javascript
{
  "_id": ObjectId,
  "name": String,              // 이름 (예: "한강", "백두산")
  "name_en": String,           // 영문명
  "type": String,              // 타입 ("mountain", "river", "lake", "sea")
  "geometry": Object,          // GeoJSON Geometry (LineString for rivers, Point for mountains)
  "elevation": Number | null,  // 고도 (m)
  "length": Number | null,     // 길이 (km, for rivers)
  "area": Number | null,       // 면적 (km², for lakes)
  "desc": String,              // 설명
  "historical_significance": String // 역사적 의의
}
```

---

#### 11. `login_logs` (로그인 로그)
사용자 로그인 기록

```javascript
{
  "_id": ObjectId,
  "user_id": String,           // 사용자 ID
  "username": String,          // 사용자명
  "date": Date,                // 로그인 날짜 (UTC, 날짜만)
  "count": Number,             // 해당 날짜 로그인 횟수
  "last_login_time": Date      // 마지막 로그인 시간
}
```

**인덱스**:
- `{ user_id: 1, date: 1 }` (unique)

---

#### 12. `page_views` (페이지 조회)
페이지별 조회수 통계

```javascript
{
  "_id": ObjectId,
  "path": String,              // 페이지 경로 (예: "/index.html")
  "date": Date,                // 날짜 (UTC, 날짜만)
  "count": Number              // 조회수
}
```

**인덱스**:
- `{ path: 1, date: 1 }` (unique)
- `{ date: 1 }`

---

#### 13. `territory_cache` (영토 캐시)
영토 폴리곤 캐시 (성능 최적화)

```javascript
{
  "_id": ObjectId,
  "cache_key": String,         // 캐시 키 (예: "territories_all")
  "data": Object,              // 캐시된 데이터
  "created_at": Date,          // 생성일
  "expires_at": Date           // 만료일
}
```

**인덱스**:
- `{ cache_key: 1 }` (unique)
- `{ expires_at: 1 }` (TTL 인덱스)

---

#### 14. `territory_tiles` (영토 타일)
TopoJSON으로 압축된 영토 데이터 (미래 확장용)

```javascript
{
  "_id": ObjectId,
  "tile_id": String,           // 타일 ID (예: "z5_x10_y20")
  "topojson": Object,          // TopoJSON 데이터
  "bbox": Array,               // Bounding Box
  "zoom_level": Number,        // 줌 레벨
  "created_at": Date
}
```

---

## 🚀 애플리케이션 기능 명세

### 1. 메인 지도 뷰어 (`index.html`)

#### 1.1 시간 컨트롤
- **연대표 슬라이더**: -3000년 ~ 현재까지 연도 선택
- **월 선택**: 1-12월 세부 제어
- **재생 기능**: 자동 연도 진행 (속도 조절 가능)
- **즐겨찾기**: 특정 시점 저장 및 빠른 이동

#### 1.2 지도 표시
- **영토 폴리곤**: GeoJSON 기반 국가별 경계선 표시
  - 지배 국가 자동 계산 (폴리곤 내 마커 기반, 수도=가중치 3, 일반 도시=1)
  - 국가별 색상/스타일 자동 적용 (fillOpacity: 0.3, weight: 2)
  - 뷰포트 기반 렌더링으로 성능 최적화
  - 중복 렌더링 방지 (Set 기반 추적)
  - 시간대별 영토 변화 표시 (start_year, end_year)
  
- **도시/성 마커**: 클릭 시 상세 정보 팝업
  - 수도: 왕성 마커 (국기 + 도시명 라벨)
  - 일반 도시: 점 마커
  - 전투지: 검 아이콘 (⚔️)
  - 군기: 깃발 마커 (장수명, 병력, 국기 표시)
  - 줌 레벨에 따른 마커 크기 자동 조절 (transform: scale)
  
- **자연 지형지물**: 레이어 토글로 표시/숨김
  - 강: 파란색 LineString (color: #3498db, weight: 2)
  - 산맥: 갈색 점선 (color: #A0522D, dashArray: '5, 10')
  - 자연 지형 마커: 산(🏔️), 강(🌊), 바다(🌊), 뻘(🟤) 아이콘
  
- **라벨 텍스트**: 지역명, 바다명 텍스트 마커
  - 배경 투명, 텍스트 그림자 효과
  - 크기: small/medium/large 선택 가능
  - 색상: 커스터마이징 지원 (hex)
  - 타입: region, sea, river 등
  
- **사용자 그리기**: 시간대별 표시/숨김
  - 성곽: '凹' 텍스트 반복 패턴 (white, font-size: 12)
  - 강: 파란색 선 (weight: 6, opacity: 0.7)
  - 산맥: 갈색 점선 (weight: 9, opacity: 0.5)
  - 화살표: Polyline Decorator 플러그인 사용
  - 일반 도형: 사용자 지정 색상 (Circle, Polygon, LineString 등)

#### 1.3 레이어 컨트롤
- **국가 선택**: 특정 국가만 표시/숨김
- **카테고리 필터**: 도시/전투지/자연지형 토글
- **투명도 조절**: 영토 폴리곤 투명도 설정
- **베이스맵 변경**: OpenStreetMap, 위성 지도 등

#### 1.4 검색 기능
- **도시 검색**: 이름으로 도시 찾기
- **국가 검색**: 국가명으로 필터링
- **인물 검색**: 왕/장군 검색 후 관련 지역 표시

#### 1.5 편집 모드 (관리자 전용)
- **도시 추가/편집/삭제**
  - 지도 클릭으로 위치 설정
  - 시간별 역사 관리
  - 다중 소속 국가 지원
- **국가 추가/편집/삭제**
  - 색상/스타일 설정
  - 시작/종료 연월 설정
- **영토 폴리곤 편집**
  - GeoJSON 업로드
  - 경계선 그리기
- **자연 지형 추가**
  - 산맥/강 경로 그리기
  - 아이콘 커스터마이징

#### 1.6 사용자 기능
- **그리기 도구**: 선/도형 그리기 및 저장
- **스크린샷**: 현재 지도 화면 캡처
- **공유**: URL로 특정 시점 공유

---

### 2. 회원 관리 시스템

#### 2.1 회원가입 (`register.html`)
- 사용자명, 이메일, 비밀번호 입력
- 이메일 중복 확인
- 비밀번호 암호화 (bcrypt)

#### 2.2 로그인 (`login.html`)
- 사용자명/이메일 + 비밀번호 인증
- JWT 토큰 발급 (유효기간: 1년)
- 세션 유지 (localStorage/sessionStorage)
- 로그인 로그 자동 기록

#### 2.3 계정 관리 (`account.html`)
- 프로필 정보 조회
- 비밀번호 변경
- 내 그림 목록 조회
- 로그인 기록 확인

---

### 3. 관리자 페이지 (`admin.html`)

#### 3.1 회원 관리
- **회원 목록**: 전체 사용자 조회
- **역할 변경**: user ↔ admin 권한 변경
- **회원 정보 수정**: 이메일, 비밀번호 수정
- **회원 삭제**: 사용자 계정 삭제
- **검색 기능**: 이름/이메일로 검색

#### 3.2 통계 대시보드
- **일별 로그인 통계**: 최근 7/30일 로그인 추이 (라인 차트)
- **페이지뷰 통계**: 페이지별 조회수 (차트 + 테이블)
  - 최근 7/30일 필터
  - 상위 10개 페이지 표시
  - 일별 추이 시각화

#### 3.3 회원 가입
- **관리자 전용 회원 가입**: admin 권한으로만 신규 회원 생성

---

### 4. 영토 관리 시스템 (`territory_manager.html`)

#### 4.1 영토 추가 방법
1. **GeoJSON 직접 입력**: JSON 데이터 붙여넣기
2. **OpenStreetMap ID**: OSM Relation ID로 자동 가져오기
3. **외부 URL**: GeoJSON 파일 URL 입력

#### 4.2 자동 처리 기능
- **bbox 자동 계산**: Geometry로부터 경계 박스 생성
- **시간 필드 자동 설정**: start_year(-3000), end_year(3000) 기본값
- **필수 필드 검증**: name, geometry.coordinates 확인
- **대용량 지원**: 최대 50MB GeoJSON 파일

#### 4.3 편의 기능
- **실시간 로깅**: 처리 과정 단계별 표시
- **검증 전용 모드**: 저장하지 않고 검증만 수행
- **JSON 내보내기**: 입력한 데이터 다운로드
- **환경 자동 감지**: 로컬/프로덕션 API 자동 선택

---

## 🔒 보안 및 인증

### JWT 인증 흐름
1. 로그인 → 서버에서 JWT 토큰 발급
2. 클라이언트에서 localStorage에 저장
3. API 요청 시 `Authorization: Bearer <token>` 헤더 첨부
4. 서버에서 토큰 검증 및 권한 확인

### 권한 미들웨어
- `verifyToken`: 로그인한 사용자
- `verifyAdmin`: admin 또는 superuser
- `verifyAdminOnly`: admin만 (회원 관리용)
- `verifySuperuser`: superuser만 (최고 관리자)

### 비밀번호 보안
- bcrypt 해싱 (salt rounds: 10)
- 평문 비밀번호 절대 저장 안 함

---

## 📡 API 명세

### 인증 API

#### POST `/api/auth/register`
- **권한**: verifyAdminOnly (admin만 가능)
- **Body**: `{ username, email, password, role }`
- **Response**: `{ message, user }`

#### POST `/api/auth/login`
- **권한**: 없음 (공개)
- **Body**: `{ username, password }`
- **Response**: `{ token, user }`

#### PUT `/api/auth/change-password`
- **권한**: verifyToken
- **Body**: `{ currentPassword, newPassword }`
- **Response**: `{ message }`

---

### 도시/성 API

#### GET `/api/castle`
- **권한**: verifyToken
- **Query**: `?country=<국가명>&year=<연도>`
- **Response**: `[ { castle documents } ]`

#### POST `/api/castle`
- **권한**: verifyAdmin
- **Body**: `{ name, lat, lng, history, ... }`
- **Response**: `{ message, castle }`

#### PUT `/api/castle/:id`
- **권한**: verifyAdmin
- **Body**: `{ name, lat, lng, ... }`
- **Response**: `{ message, castle }`

#### DELETE `/api/castle/:id`
- **권한**: verifyAdmin
- **Response**: `{ message }`

---

### 국가 API

#### GET `/api/countries`
- **권한**: verifyToken
- **Response**: `[ { country documents } ]`

#### POST `/api/countries`
- **권한**: verifyAdmin
- **Body**: `{ name, color, start_year, end_year, ... }`
- **Response**: `{ message, country }`

#### GET `/api/countries/:name`
- **권한**: verifyToken
- **Response**: `{ country document }`

#### PUT `/api/countries/:name`
- **권한**: verifyAdmin
- **Body**: `{ name, color, ... }`
- **Response**: `{ message, country }`

#### DELETE `/api/countries/:name`
- **권한**: verifyAdmin
- **Response**: `{ message }`

---

### 영토 API

#### GET `/api/territories`
- **권한**: verifyToken
- **Query**: `?country=<국가명>&year=<연도>&month=<월>`
- **Response**: `[ { territory documents } ]`

#### POST `/api/territories`
- **권한**: verifyAdmin
- **Body**: `{ name, geometry, bbox, start_year, end_year, ... }`
- **Response**: `{ message, count, ids }`
- **특징**: 배치 삽입 지원, 자동 bbox 계산, 자동 시간 필드 설정

#### PUT `/api/territories/:id`
- **권한**: verifyAdmin
- **Body**: `{ name, geometry, ... }`
- **Response**: `{ message, territory }`

#### DELETE `/api/territories/:id`
- **권한**: verifyAdmin
- **Response**: `{ message }`

---

### 사용자 관리 API

#### GET `/api/users`
- **권한**: verifyAdminOnly
- **Response**: `[ { username, email, role, created_at } ]`

#### PUT `/api/users/:id`
- **권한**: verifyAdminOnly
- **Body**: `{ username, email, role, password? }`
- **Response**: `{ message }`

#### DELETE `/api/users/:id`
- **권한**: verifyAdminOnly
- **Response**: `{ message }`

---

### 통계 API

#### GET `/api/stats/daily-logins`
- **권한**: verifyAdminOnly
- **Query**: `?days=<일수>&top=<상위N명>`
- **Response**: `{ labels, datasets, totals }`

#### GET `/api/stats/page-views`
- **권한**: verifyAdminOnly
- **Query**: `?days=<일수>&top=<상위N페이지>`
- **Response**: `{ labels, datasets, totals }`

---

## 🎨 UI/UX 특징

### 1. 반응형 디자인
- 모바일/태블릿/데스크톱 대응
- 터치 제스처 지원
- 가로/세로 모드 자동 조정

### 2. 다크 모드
- 배경: `#0c0d15`
- 카드: `#2c3e50`
- 텍스트: `#ecf0f1`
- 지도 위 가독성 최적화

### 3. 애니메이션
- 연도 전환 시 부드러운 페이드
- 마커 클릭 시 펄스 효과
- 팝업 슬라이드 인/아웃

### 4. 접근성
- ARIA 레이블
- 키보드 네비게이션
- 고대비 모드 지원

---

## ⚡ 성능 최적화

### 1. 영토 로딩
- **백그라운드 로딩**: 연대표는 즉시 사용 가능, 영토는 백그라운드에서 로드
- **지리공간 인덱스**: bbox 기반 빠른 쿼리
- **압축**: gzip/compression 미들웨어

### 2. 데이터 캐싱
- 브라우저 localStorage: 영토 데이터
- MongoDB 캐시: 자주 조회되는 쿼리 결과
- HTTP 캐시 헤더

### 3. 이미지 최적화
- WebP 포맷 사용
- Lazy loading
- CDN 활용

---

## 🐛 디버깅 & 로깅

### 서버 로그
- `📥 서버 수신 데이터`: 요청 body 전체 출력
- `✅ DB 업데이트 결과`: MongoDB 작업 결과
- `🔍 [verifyAdmin]`: JWT 검증 과정
- `❌ [ERROR]`: 오류 상세 정보

### 클라이언트 로그
- `console.log`: 일반 정보
- `console.warn`: 경고
- `console.error`: 오류
- Territory Manager: 실시간 로그 패널

---

## 📦 배포 프로세스

### 1. 개발 환경
```bash
npm install
npm start  # localhost:3000
```

### 2. 프로덕션 배포
```bash
git add .
git commit -m "메시지"
git push origin main
```

### 3. 자동 배포 (Vercel)
- GitHub push 감지
- 자동 빌드 & 배포
- 환경 변수 자동 주입

---

## 🔧 환경 변수 (`.env`)

```env
# MongoDB
MONGODB_URI=mongodb+srv://...
MONGO_URI=mongodb+srv://...  # 별칭

# JWT Secret
JWT_SECRET=your_secret_key

# Server
PORT=3000
NODE_ENV=production
```

---

## 📚 주요 파일 구조

```
KoreaHistory/
├── index.html              # 메인 지도 뷰어
├── login.html              # 로그인
├── register.html           # 회원가입
├── account.html            # 계정 관리
├── admin.html              # 관리자 페이지
├── territory_manager.html  # 영토 관리 도구
├── server.js               # Express API 서버
├── db.js                   # MongoDB 연결 및 컬렉션 초기화
├── package.json            # npm 의존성
├── vercel.json             # Vercel 배포 설정
├── .env                    # 환경 변수 (gitignore)
├── scripts/                # DB 관리 스크립트
│   ├── import_*.js         # 데이터 임포트
│   ├── add_*.js            # 데이터 추가
│   └── check_*.js          # 데이터 검증
└── README.md               # 프로젝트 설명
```

---

## 🚀 향후 개발 계획

### Phase 1 (완료)
- ✅ 기본 지도 뷰어
- ✅ 회원 시스템
- ✅ 영토 폴리곤 지원
- ✅ 관리자 페이지
- ✅ 영토 자동화 도구

### Phase 2 (진행 중)
- 🔄 모바일 앱 (React Native)
- 🔄 다국어 지원 (한/영/중/일)
- 🔄 3D 지도 뷰

### Phase 3 (계획)
- ⏳ AI 추천 시스템
- ⏳ 소셜 기능 (댓글, 공유)
- ⏳ VR/AR 지원

---

## 📞 문의 및 지원

- **GitHub**: [projeffmanager-design/historymap](https://github.com/projeffmanager-design/historymap)
- **Issues**: GitHub Issues 페이지
- **문서**: `README.md`, `DEBUG_GUIDE.md`, `TERRITORY_MANAGER_GUIDE.md`

---

**마지막 업데이트**: 2026년 1월 14일  
**버전**: 2.0.0  
**작성자**: Korea History Map Team
