# 역사지도 프로젝트 시스템 명세서

**버전**: v4.0.0  
**최종 업데이트**: 2026년 2월 20일  
**데이터베이스**: MongoDB Atlas — `realhistory`  
**배포 플랫폼**: Vercel (프론트엔드 + API 통합)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [파일 구조](#3-파일-구조)
4. [데이터베이스 스키마](#4-데이터베이스-스키마)
5. [API 엔드포인트 명세](#5-api-엔드포인트-명세)
6. [인증 및 권한 시스템](#6-인증-및-권한-시스템)
7. [직급 체계 (RANK_CONFIG)](#7-직급-체계-rank_config)
8. [프론트엔드 UI 기능](#8-프론트엔드-ui-기능)
9. [지도 레이어 시스템](#9-지도-레이어-시스템)
10. [사료 기여 워크플로우](#10-사료-기여-워크플로우)
11. [타임라인 & 슬라이더 시스템](#11-타임라인--슬라이더-시스템)
12. [영토 관리 시스템](#12-영토-관리-시스템)
13. [성능 최적화](#13-성능-최적화)
14. [배포 및 운영](#14-배포-및-운영)

---

## 1. 프로젝트 개요

역사지도는 한국·동아시아 역사를 인터랙티브 지도로 탐색하고, 사용자 기여(사료 제출·검토·승인)를 통해 집단지성으로 역사 데이터를 축적하는 플랫폼입니다.

### 핵심 기능 요약

| 기능 | 설명 |
|------|------|
| 역사 지도 뷰어 | Leaflet.js 기반 동아시아 역사지도, 타임슬라이더로 연도별 탐색 |
| 국가·성·인물 관리 | 국가/성/장수/왕 정보 CRUD, 관리자 전용 |
| 사료 기여 시스템 | 일반 사용자 사료 제출 → 검토자 검토 → 고위직 최종 승인 → Castle 자동 변환 |
| 직급 체계 | 점수 기반 자동 진급 (수습~정3품), 관리자 지정 재상급 (종2품~정1품) |
| 사료 목록 페이지 | 사료 투표·댓글·검색·필터 기능 (ranking.html) |
| 영토 폴리곤 관리 | OSM/GeoJSON 기반 영토 데이터, LOD(Level of Detail) 캐시 |
| 랭킹 시스템 | 사용자 점수·직급·기여 통계 공개 랭킹 |
| 관리자 패널 | 사용자 관리, 레이어 설정, 통계 조회, 계정 잠금 등 |

---

## 2. 기술 스택

### 백엔드
- **런타임**: Node.js
- **프레임워크**: Express.js
- **데이터베이스**: MongoDB Atlas (MongoDB 드라이버 직접 사용)
- **인증**: JWT (`jsonwebtoken`) — 유효기간 365일
- **비밀번호 암호화**: `bcryptjs` (rounds: 10)
- **응답 압축**: `compression` 미들웨어
- **CORS**: `cors` (개발 환경: 전체 허용)
- **요청 크기 제한**: `50mb` (GeoJSON 지원)

### 프론트엔드
- **HTML5 / CSS3 / Vanilla JavaScript**
- **지도 라이브러리**: Leaflet.js
- **차트**: Chart.js
- **아이콘**: 커스텀 SVG + PNG 이미지

### 환경 변수 (`.env`)

| 변수명 | 설명 |
|--------|------|
| `MONGO_URI` | MongoDB Atlas 연결 문자열 |
| `JWT_SECRET` | JWT 서명 비밀키 |

---

## 3. 파일 구조

```
/
├── server.js               # Express API 서버 (메인 진입점)
├── db.js                   # MongoDB 연결 및 컬렉션 초기화
├── index.html              # 메인 지도 뷰어 (17,700+ 줄)
├── admin.html              # 관리자 패널
├── ranking.html            # 사료 목록 / 랭킹 페이지
├── account.html            # 사용자 계정 관리
├── login.html              # 로그인 페이지
├── register.html           # 회원가입 페이지
├── territory_manager.html  # 영토 관리자 페이지
├── rank_info.html          # 직급 안내 페이지
├── recruit.html            # 사관 모집 페이지
├── vercel.json             # Vercel 배포 설정
├── package.json            # Node.js 의존성
├── data/                   # GeoJSON 지역 데이터
│   ├── asia.json
│   └── natural_earth/
├── public/tiles/           # 영토 타일 파일
├── scripts/                # 유지보수 스크립트 모음
├── backups/                # 날짜별 자동 백업 (YYYYMMDD_HHMMSS/)
└── *.json                  # 국가/지역 경계 GeoJSON
    ├── korea-provinces.json
    ├── world-countries.json
    ├── china-provinces.json
    ├── mongolia-aimags.json
    └── russia-regions.json
```

---

## 4. 데이터베이스 스키마

### 4.1 `castle` 컬렉션 — 성/도시/지명 마커

```javascript
{
  _id: ObjectId,
  name: String,
  lat: Number,
  lng: Number,
  photo: String | null,
  desc: String,
  country_id: ObjectId | null,
  is_capital: Boolean,
  is_battle: Boolean,
  is_military_flag: Boolean,
  is_natural_feature: Boolean,
  is_label: Boolean,
  natural_feature_type: String | null,  // 'river'|'mountain'|'lake'
  label_type: String | null,            // 'place'|'country'|'ethnic'|'region'
  label_color: String,                  // 기본: '#ffffff'
  label_size: String,                   // 'small'|'medium'|'large'
  built_year: Number | null,
  built_month: Number | null,
  destroyed_year: Number | null,
  destroyed_month: Number | null,
  custom_icon: String | null,
  icon_width: Number | null,
  icon_height: Number | null,
  history: [{
    name: String,
    country_id: String,
    start_year: Number,
    start_month: Number,
    end_year: Number | null,
    end_month: Number | null,
    is_capital: Boolean,
    is_battle: Boolean
  }],
  path_data: Array,
  deleted: Boolean,           // 소프트 삭제 플래그
  deletedAt: Date | null,
  originContributionId: String | null,
  createdBy: String | null
}
```

### 4.2 `countries` 컬렉션 — 국가/왕조

```javascript
{
  _id: ObjectId,
  name: String,
  color: String,              // hex 색상
  start: Number,
  end: Number | null,
  is_main_dynasty: Boolean,
  capital: String | null,
  dynasty: String | null,
  ethnicity: String | null,
  religion: String | null,
  description: String | null,
  sealText: String | null,    // 낙인 글씨 직접 지정 (1~2자)
                               // null → 국명 자동 추출 (한자 마지막 > 한글 마지막 > '?')
  auto_created: Boolean,
  createdFrom: String | null
}
```

### 4.3 `users` 컬렉션 — 사용자

```javascript
{
  _id: ObjectId,
  username: String,           // 고유
  email: String,              // 고유
  password: String,           // bcrypt (rounds:10)
  role: String,               // 'user'|'admin'|'superuser'
  position: String,           // 현재 직급명 (로그인 시 갱신)
  designated_rank: Number | null,     // 관리자 지정 재상급 번호 (1~4)
  designated_position: String | null, // 관리자 지정 직급 (강제 적용)
  reviewScore: Number,
  approvalScore: Number,
  attendancePoints: Number,
  totalCount: Number,
  approvedCount: Number,
  dailyVoteCount: Number,
  lastVoteDate: Date | null,
  lastAttendanceDate: String | null,  // YYYY-MM-DD
  isGuest: Boolean,
  isLocked: Boolean,
  createdAt: Date,
  lastLogin: Date | null
}
```

### 4.4 `contributions` 컬렉션 — 사료 기여

```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  username: String,
  category: String,   // 'city'|'castle'|'natural_feature'|'place_label'|'historical_record'
  status: String,     // 'pending'|'reviewed'|'approved'|'rejected'

  // 지도 기반 기여
  name: String,
  lat: Number,
  lng: Number,
  description: String,
  evidence: String,
  placeType: String,          // 'city'|'castle'
  is_natural_feature: Boolean,
  natural_feature_type: String | null,
  country_id: String | null,
  new_country_name: String | null,  // 신규 국가 자동 생성용
  start_year: Number | null,
  end_year: Number | null,
  is_capital: Boolean,

  // 사관 기록 전용
  year: Number | null,
  source: String | null,
  content: String | null,

  votes: Number,
  votedBy: [String],          // userId 배열

  // 검토
  reviewerId: ObjectId | null,
  reviewerUsername: String | null,
  reviewedAt: Date | null,
  reviewComment: String | null,

  // 최종 승인
  approverId: ObjectId | null,
  approverUsername: String | null,
  approvedAt: Date | null,
  approveComment: String | null,

  // 댓글 (embedded)
  comments: [{
    _id: ObjectId,
    author: String,
    text: String,
    createdAt: Date
  }],

  createdAt: Date
}
```

### 4.5 `kings` 컬렉션 — 왕/군주

```javascript
{ _id, name, country_id, start_year, end_year, description, image }
```

### 4.6 `history` 컬렉션 — 역사 사건

```javascript
{ _id, name, year, month, country_id, description, type }
```

### 4.7 `events` 컬렉션 — 이벤트 마커

```javascript
{ _id, name, lat, lng, year, description, type }
```

### 4.8 `drawings` 컬렉션 — 지도 그림/주석

```javascript
{ _id, name, type, coordinates, color, year, description }
```

### 4.9 `territories` 컬렉션 — 영토 폴리곤

```javascript
{
  _id, name, country_id, start_year, end_year,
  geometry: GeoJSON,      // 2dsphere 인덱스
  osm_id, bbox: [minLon, minLat, maxLon, maxLat],
  simplified, area_km2
}
```

### 4.10 `territory_tiles` 컬렉션 — 영토 타일 캐시

```javascript
{ tileKey, zoom, x, y, data: TopoJSON, createdAt }
```

### 4.11 `natural_features` 컬렉션 — 자연 지형지물

```javascript
{ _id, name, type, geometry: GeoJSON, description }
```

### 4.12 `general` 컬렉션 — 장수/인물

```javascript
{ _id, name, country_id, start_year, end_year, description, image }
```

### 4.13 `login_logs` 컬렉션

```javascript
{ _id, userId: ObjectId, timestamp: Date }
```

### 4.14 `page_views` 컬렉션

```javascript
{ _id, path, date, count, firstSeenAt }
```

### 4.15 `layer_settings` 컬렉션

```javascript
{
  type: 'default',
  settings: {
    city, placeLabel, countryLabel, ethnicLabel, military, natural,
    event, territoryPolygon, rivers, timeline, kingPanel, historyPanel,
    userContributions
  },
  updatedAt
}
```

---

## 5. API 엔드포인트 명세

### 5.1 인증 미들웨어

| 미들웨어 | 설명 |
|----------|------|
| `verifyToken` | JWT 검증 (일반 사용자 이상) |
| `verifyAdmin` | admin + superuser |
| `verifyAdminOnly` | admin 만 |
| `verifySuperuser` | superuser 만 |
| `verifyApprover` | 정2품 수국사 이상 + admin/superuser |

### 5.2 성/도시 (Castle) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/castle` | verifyToken | 전체 조회 (`?label_type=`) |
| GET | `/api/castle/:id` | verifyToken | 단일 조회 |
| POST | `/api/castle` | verifyToken | 생성 |
| PUT | `/api/castle/:id` | verifyToken | 수정 |
| DELETE | `/api/castle/:id` | verifyAdmin | 소프트 삭제 |
| PUT | `/api/castle/:id/restore` | verifyAdmin | 복구 |
| DELETE | `/api/castle/:id/permanent` | verifyAdmin | 영구 삭제 |
| GET | `/api/castle/trash` | verifyAdmin | 휴지통 목록 |

### 5.3 국가 (Countries) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/countries` | verifyToken | 전체 조회 |
| GET | `/api/countries/:name` | verifyToken | 이름으로 조회 |
| POST | `/api/countries` | verifyAdmin | 생성 |
| PUT | `/api/countries/:name` | verifyAdmin | 수정 (`sealText` 포함) |
| DELETE | `/api/countries/:name` | verifyAdmin | 삭제 |

### 5.4 왕 (Kings) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/kings` | 없음 | 전체 조회 |
| GET | `/api/kings/:id` | verifyToken | 단일 조회 |
| POST | `/api/kings` | verifyAdmin | 생성 |
| PUT | `/api/kings/:id` | verifyAdmin | 수정 |
| DELETE | `/api/kings/:id` | verifyAdmin | 삭제 |

### 5.5 역사 사건 (History) API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/history` | verifyToken |
| POST | `/api/history` | verifyAdmin |
| PUT | `/api/history/:id` | verifyAdmin |
| DELETE | `/api/history/:id` | verifyAdmin |

### 5.6 이벤트 마커 (Events) API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/events` | verifyToken |
| GET | `/api/events/:id` | verifyToken |
| POST | `/api/events` | verifyAdmin |
| PUT | `/api/events/:id` | verifyAdmin |
| DELETE | `/api/events/:id` | verifyAdmin |

### 5.7 그림/주석 (Drawings) API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/drawings` | verifyToken |
| GET | `/api/drawings/:id` | verifyToken |
| POST | `/api/drawings` | verifyAdmin |
| PUT | `/api/drawings/:id` | verifyAdmin |
| DELETE | `/api/drawings/:id` | verifyAdmin |

### 5.8 장수/인물 (General) API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/general` | verifyToken |
| POST | `/api/general` | verifyAdmin |
| PUT | `/api/general/:id` | verifyAdmin |
| DELETE | `/api/general/:id` | verifyAdmin |

### 5.9 영토 (Territories) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/territories` | 없음 | 영토 폴리곤 조회 |
| POST | `/api/territories` | verifyAdmin | 생성 |
| PUT | `/api/territories/:id` | verifyAdmin | 수정 |
| DELETE | `/api/territories/:id` | verifyAdmin | 삭제 |
| DELETE | `/api/territories/by-osm/:osm` | verifyAdmin | OSM ID로 삭제 |
| GET | `/api/territory-tiles` | verifyToken | 타일 캐시 조회 |
| GET | `/api/territory-cache` | 없음 | 캐시 조회 |
| DELETE | `/api/territory-cache` | verifyAdmin | 캐시 초기화 |
| POST | `/api/territory-cache/recalculate` | verifyAdmin | 캐시 재계산 |

### 5.10 자연 지형지물 (Natural Features) API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/natural-features` | 없음 |
| POST | `/api/natural-features` | verifyToken |

### 5.11 인증 (Auth) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/signup` | 없음 | 공개 회원가입 |
| POST | `/api/auth/register` | verifyAdminOnly | 관리자용 등록 (역할·직급 지정) |
| POST | `/api/auth/login` | 없음 | 로그인 → JWT 발급 (365일) |
| POST | `/api/auth/guest-login` | 없음 | 게스트 로그인 (24일 토큰) |
| PUT | `/api/auth/change-password` | verifyToken | 비밀번호 변경 |

**로그인 부가 동작**: 계정 잠금 확인 → 로그인 로그 기록 → 오늘 첫 로그인 시 attendancePoints +1 → JWT 발급

### 5.12 사용자 관리 (Users) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/users` | verifyAdminOnly | 전체 목록 |
| GET | `/api/user/me` | verifyToken | 내 정보 |
| PUT | `/api/users/:id` | verifyAdminOnly | 정보 수정 |
| DELETE | `/api/users/:id` | verifyAdminOnly | 삭제 |
| PUT | `/api/users/:id/role` | verifyAdmin | 역할 변경 |
| PUT | `/api/users/:id/designated-position` | verifyAdmin | 직급 강제 지정 |
| PUT | `/api/users/:id/designated-rank` | verifyAdmin | 재상급 번호 지정 (1~4) |
| PUT | `/api/users/:id/lock` | verifyAdmin | 계정 잠금/해제 |
| POST | `/api/admin/switch-user/:userId` | verifyAdmin | 해당 사용자 JWT 발급 |

### 5.13 사료 기여 (Contributions) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/contributions` | 없음 | 목록 조회 (`?status=&userId=`) |
| POST | `/api/contributions` | verifyToken | 사료 제출 |
| PUT | `/api/contributions/:id/vote` | verifyToken | 추천 (일일 10회 제한) |
| PUT | `/api/contributions/:id/review` | verifyToken | 검토 (시강학사 이상) |
| PUT | `/api/contributions/:id/status` | verifyApprover | 상태 변경 → Castle 자동 생성 |
| PUT | `/api/contributions/:id/approve` | verifyToken | 최종 승인 (동수국사 이상) → Castle 자동 생성 |
| DELETE | `/api/contributions/:id/my` | verifyToken | 본인 삭제 (승인 전만) |
| DELETE | `/api/contributions/:id` | verifyAdmin | 관리자 삭제 (점수 역산) |
| GET | `/api/contributions/:id/comments` | 없음 | 댓글 목록 |
| POST | `/api/contributions/:id/comments` | verifyToken | 댓글 작성 |
| DELETE | `/api/contributions/:id/comments/:commentId` | verifyToken | 댓글 삭제 (본인/관리자) |

### 5.14 랭킹 & 관리 API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/rankings` | 없음 | 전체 사용자 랭킹 |
| POST | `/api/admin/recalculate-scores` | verifyToken (admin) | 점수 재계산 |

**랭킹 점수** = (제출수 × 3) + (승인수 × 10) + 추천수 + reviewScore + approvalScore + attendancePoints

### 5.15 통계 (Stats) API

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/stats/daily-logins` | verifyAdminOnly | 최근 7일 일일 접속자 |
| GET | `/api/stats/page-views` | verifyAdminOnly | 페이지별 조회수 |

### 5.16 레이어 설정 API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/layer-settings` | 없음 |
| PUT | `/api/layer-settings` | verifyAdmin |

---

## 6. 인증 및 권한 시스템

### 역할 (Role)

| role | 설명 |
|------|------|
| `user` | 일반 사용자: 지도 열람, 사료 제출, 투표, 댓글 |
| `admin` | 관리자: 모든 CRUD, 사용자 관리, 레이어 설정 |
| `superuser` | 최상위 관리자: 시스템 전체 권한 |

### JWT 페이로드

```javascript
{
  userId: String,
  username: String,
  role: String,
  position: String,
  isGuest: Boolean,   // 게스트만
  iat, exp            // 발급/만료 (365일)
}
```

---

## 7. 직급 체계 (RANK_CONFIG)

### 점수 가중치

| 활동 | 점수 |
|------|------|
| 사료 제출 1건 | +3 |
| 사료 승인 1건 | +10 |
| 추천 받기 | +1/회 |
| 검토 보너스 | +5/건 |
| 승인 보너스 | +5/건 |
| 최종 승인 보너스 | +10/건 |
| 매일 출석 | +1 |
| 일일 추천 한도 | 10회/일 |

### 자동 진급 직급 (점수 기반)

| 직급명 | 등급 | 최소 점수 |
|--------|------|----------|
| 수찬관(修撰官) | 정3품 | 2,600 |
| 직수찬관(直修撰官) | 종3품 | 2,100 |
| 사관수찬(史館修撰) | 정4품 | 1,700 |
| 시강학사(侍講學士) | 종4품 | 1,400 |
| 기거주(起居注)/낭중(郞中) | 정5품 | 1,100 |
| 기거사(起居舍)/원외랑(員外郞) | 종5품 | 850 |
| 기거랑(起居郞)/직사관(直史館) | 정6품 | 650 |
| 기거도위(起居都尉) | 종6품 | 450 |
| 수찬(修撰) | 정7품 | 300 |
| 직문한(直文翰) | 종7품 | 200 |
| 주서(注書) | 정8품 | 120 |
| 검열(檢閱) | 종8품 | 60 |
| 정자(正字) | 정9품 | 30 |
| 수분권지(修分權知) | 수습 | 0 |

### 재상급 직급 (순위 + 최소 점수 기반)

| 순위 | 직급명 | 등급 | 최소 점수 |
|------|--------|------|----------|
| 1위 | 감수국사(監修國史) | 정1품 | 5,000 |
| 2위 | 판사관사(判史館事) | 종1품 | 4,300 |
| 3위 | 수국사(修國史) | 정2품 | 3,700 |
| 4위 | 동수국사(同修國史) | 종2품 | 3,100 |

관리자 `designated_rank` 지정 시 점수·순위 무관 강제 적용.

### 검토/승인 권한

| 기능 | 최소 직급 |
|------|----------|
| 사료 검토 (`/review`) | 시강학사 (종4품) |
| 최종 승인 (`/approve`) | 동수국사 (종2품) |
| API 승인 (`/status`) | 수국사 (정2품) |

---

## 8. 프론트엔드 UI 기능

### 8.1 메인 지도 (`index.html`)

- **지도 엔진**: Leaflet.js (OSM 타일)
- **마커 분류**: 성/수도/전투지/자연지물/레이블 등
- **국가 낙인 마커**: 수도 위치에 인감 스타일 표시
  - `countries.sealText` 우선 → 국명 자동 추출 (한자 > 한글 > `?`)
- **마커 팝업**: 이름, 국가, 기간, 💬 댓글 수 표시
- **영토 폴리곤**: 타임슬라이더 연도 기준 국가 색상 오버레이
- **LOD**: 줌 레벨 기반 마커 밀도 자동 조절

### 8.2 국가 편집 폼

- 이름(자동완성), 색상, 건국/멸망 연도, 수도, 민족, 종교, 설명
- **낙인 글씨 필드** (`#countrySealText`): 1~2자 직접 입력, 비워두면 자동 추출

### 8.3 타임슬라이더 (`#combinedSlider`)

- 범위: `min=-60000` ~ `max=24359` (총 개월 단위), `step=1`
- **핸들 디자인**:
  - 크기 24×24px, 배경색 `#1e2a38`, 금색 테두리 `2px solid #DAA520`
  - 중앙 낙관 PNG 이미지 (`background-size: 80% 80%`)
  - 모양 `border-radius: 3px 3px 12px 12px`
  - hover: scale(1.1) / active: scale(0.95)

### 8.4 눈금 바 (`#slider-ticks-bar`)

슬라이더 바로 아래 위치 (`margin-top: 1px`), 높이 22px, `pointer-events: none`

| 눈금 종류 | 간격 | 표시 |
|----------|------|------|
| Major | 500년 | 레이블(10px) + 10px 선 |
| Minor | 100년 | 6px 선만 |

CSS:
- `.slider-tick`: `position: absolute; display: flex; flex-direction: column; align-items: center; transform: translateX(-50%)`
- `.slider-tick-line.major`: `background: rgba(255,255,255,0.7); width: 1.5px`
- `.slider-tick-label.major`: `font-size: 10px; color: rgba(255,255,255,0.85); font-weight: 500`

### 8.5 탑바

배경색: `rgba(30, 42, 56, 0.95)` (`#1e2a38`). 로그인/로그아웃, 연도 표시, 직급 표시, 레이어 토글.

### 8.6 연대표 / 왕 패널 / 역사 패널

타임슬라이더와 연동하여 해당 연도의 국가 존속 기간, 재위 왕, 역사 사건 표시.

### 8.7 사료 목록 페이지 (`ranking.html`)

- 사료 목록: 검색·필터·정렬 (상태별: pending/reviewed/approved/rejected)
- 사료별 투표 버튼 + 💬 댓글 수 표시 및 댓글 작성
- 사용자 랭킹 테이블 (점수·직급·기여통계)

---

## 9. 지도 레이어 시스템

| 레이어 키 | 설명 | 기본값 |
|-----------|------|--------|
| `city` | 성/도시 마커 | true |
| `placeLabel` | 지명 레이블 | false |
| `countryLabel` | 국가명 레이블 | true |
| `ethnicLabel` | 민족 레이블 | false |
| `military` | 군사 마커 | false |
| `natural` | 자연 지형 마커 | true |
| `event` | 이벤트 마커 | false |
| `territoryPolygon` | 영토 폴리곤 | true |
| `rivers` | 강 레이어 | false |
| `timeline` | 연대표 패널 | true |
| `kingPanel` | 왕 패널 | false |
| `historyPanel` | 역사 패널 | false |
| `userContributions` | 기여 마커 | true |

`layer_settings` 컬렉션에서 관리자가 기본값 설정 가능.

---

## 10. 사료 기여 워크플로우

### 제출 카테고리

| category | 설명 |
|----------|------|
| `city` | 도시 추가 제안 |
| `castle` | 성/요새 추가 제안 |
| `natural_feature` | 자연 지형지물 제안 |
| `place_label` | 지명 레이블 제안 |
| `historical_record` | 사관 기록 (텍스트, 지도 미반영) |

### 워크플로우

```
제출 → 검토자 자동 배정 (assignable 직급 중 랜덤, 본인 제외)
  ↓ (pending)
시강학사~수찬관: /review → reviewed 또는 rejected (+5점)
  ↓ (reviewed)
동수국사 이상: /approve → approved (+10점, 검토자 +5점, 기여자 approvedCount+1)
  → Castle 자동 생성 (지도 기반 기여만)
    → new_country_name 있으면 국가 자동 생성
```

### 투표 제한

일일 10회 (`users.dailyVoteCount` + `users.lastVoteDate`로 관리, 날짜 변경 시 리셋)

---

## 11. 타임라인 & 슬라이더 시스템

### 시간 변환

```javascript
yearMonthToTotalMonths(year, month) = (year + 60000) * 12 + (month - 1)
totalMonthsToYearMonth(n) = { year: floor(n/12) - 60000, month: n%12 + 1 }
```

### 슬라이더 범위

| min | max | step | 기본값 |
|-----|-----|------|--------|
| -60000 | 24359 | 1 | 4800 |

### 눈금 생성 (`createSliderTicks()`)

- 범위: -5000년 ~ 2500년
- Major 500년 간격 (레이블 먼저, 라인 나중)
- Minor 100년 간격 (라인만)
- 슬라이더 너비 대비 비례 배치, 초기화·리사이즈 시 재생성

---

## 12. 영토 관리 시스템

- 데이터 소스: OSM (`test_osm_import.js`), GeoJSON 파일 (`scripts/add_*.js`)
- 2dsphere 인덱스: `territories.geometry`, `natural_features.geometry`, `castle.location`
- 캐시: `territory_cache` 컬렉션, `/api/territory-cache/recalculate`로 재계산

---

## 13. 성능 최적화

### 서버
- `compression()` gzip 압축
- `express.json({ limit: '50mb' })` 대용량 GeoJSON 지원
- MongoDB 2dsphere 인덱스
- `castle` 조회 시 `deleted: false` 자동 필터

### 클라이언트
- LOD: 줌 레벨 기반 마커/레이어 on/off
- 타임슬라이더 throttle
- 눈금 바 `pointer-events: none`

---

## 14. 배포 및 운영

### Vercel 배포

- 정적 파일 루트 디렉토리 서빙
- API → `server.js` 함수 라우팅
- 환경 변수: `MONGO_URI`, `JWT_SECRET`

### 로컬 개발

```bash
npm install
node server.js        # http://localhost:3000
```

### 유지보수 스크립트

| 스크립트 | 역할 |
|----------|------|
| `scripts/check_and_fix_indexes.js` | MongoDB 인덱스 점검 |
| `scripts/analyze_mongodb_performance.js` | 성능 분석 |
| `recalculate_scores.js` | 점수 재계산 |
| `backupdb.sh` | DB 백업 |
| `backupapp.sh` | 앱 + DB 백업 |
| `restart_server.sh` | 서버 재시작 |

### 페이지 조회 자동 추적

모든 `.html` 요청을 `page_views` 컬렉션에 날짜별 누적 기록. `/api/stats/page-views`로 조회.

---

## 부록: 주요 설계 결정 사항

### 소프트 삭제 (Castle)
`castle` 컬렉션은 하드 삭제 대신 `deleted: true` 플래그 방식. 관리자 패널 trash 뷰에서 복구·영구 삭제 가능.

### 직급 이중 검증
검토/승인 API에서 JWT `position`과 DB 실시간 직급 모두 확인. 재로그인 없이도 직급 변경 즉시 반영.

### 기여→Castle 자동 변환
최종 승인 시 `contributions` 문서를 `castle` 문서로 자동 변환. Castle 변환 실패해도 승인 상태 유지 (롤백 없음). `originContributionId`로 원본 연계.

### 검토자 자동 배정
사료 제출 시 `RANK_CONFIG.roles.assignable` 직급 보유자 중 랜덤 배정 (본인 제외). 없으면 관리자가 직접 승인.

### 낙인(Seal) 글씨
`countries.sealText` 직접 지정 우선. 없으면 국명 자동 추출: 한자 마지막 글자 → 한글 마지막 글자 → `?`.

### 게스트 계정
`/api/auth/guest-login` → '송나라 사신 서긍' 계정 24일 JWT. 계정 없으면 자동 생성. 랭킹 제외(`RANKING_HIDDEN_USERS`).
