/**
 * 고려만리지도 — 지역별 시대별 인구 생성 스크립트 v3
 *
 * 핵심 원칙:
 * - 인구는 지역의 속성 (국가와 무관)
 * - 전체 castle을 지리적으로 클러스터링
 * - 각 클러스터(지역)에 시대별 인구 밀도 부여
 * - 국가별 집계는 별도 단계에서 처리
 *
 * 실행: node seed_population_by_era.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';
const GRID_SIZE = 1.0; // 클러스터 격자 크기 (도 단위) — 1도로 촘촘하게

// ════════════════════════════════════════════════════════
// 시대별 동아시아 전체 인구 지수
// (각 지역 인구 = 기준값 × 시대계수)
// ════════════════════════════════════════════════════════
const ERA_SCALE = {
  '-200': 0.055, // 한 제국 초기
     '0': 0.065, // 기원전후
   '200': 0.060, // 삼국시대
   '400': 0.055, // 남북조 혼란기
   '500': 0.060,
   '600': 0.080, // 수 통일기
   '650': 0.100, // 당 전성기
   '700': 0.110,
   '750': 0.130, // 당 개원성세 ~7,000만
   '800': 0.095, // 안사의 난 이후
   '900': 0.100, // 오대십국
  '1000': 0.115, // 북송 초기
  '1050': 0.145,
  '1100': 0.185, // 북송 전성기 ~1억
  '1127': 0.180, // 북송 멸망
  '1150': 0.165,
  '1200': 0.195, // 남송 전성기 ~1.2억
  '1231': 0.165, // 몽골 침입
  '1250': 0.130, // 전쟁기
  '1280': 0.110, // 원 통일 ~7,000만
  '1300': 0.115,
  '1350': 0.105, // 원 말기
  '1400': 0.125, // 명 초기
  '1450': 0.140,
  '1500': 0.160,
  '1600': 0.200,
  '1700': 0.240,
  '1800': 0.350,
};

function getEraScale(year) {
  const years = Object.keys(ERA_SCALE).map(Number).sort((a, b) => a - b);
  let best = years[0];
  for (const y of years) {
    if (y <= year) best = y;
    else break;
  }
  return ERA_SCALE[best];
}

// ════════════════════════════════════════════════════════
// 지역별 인구 밀도 가중치
// castle이 많은 곳 = 역사적으로 중요한 거점 = 인구 밀집
// castle당 기준 인구 (명)
// ════════════════════════════════════════════════════════
const BASE_POP_PER_CASTLE = 50000;   // 전체 평균
const MAX_POP_PER_CLUSTER = 2000000; // 클러스터 최대 인구 (200만)

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ MongoDB 연결');

  const db = client.db(DB_NAME);

  // ── 1. 전체 castle 로드 (국가 무관) ──────────────────
  const castles = await db.collection('castle').find(
    {},
    { projection: { lat: 1, lng: 1, name: 1, country_id: 1 } }
  ).toArray();

  console.log(`\n🏰 전체 castle: ${castles.length}개`);

  // ── 2. 지리적 클러스터링 (국가 무관) ─────────────────
  const grid = {};
  castles.forEach(c => {
    if (!c.lat || !c.lng) return;
    // 동아시아 범위 필터
    if (c.lat < 10 || c.lat > 60) return;
    if (c.lng < 60 || c.lng > 145) return;

    const gLat = Math.floor(c.lat / GRID_SIZE) * GRID_SIZE;
    const gLng = Math.floor(c.lng / GRID_SIZE) * GRID_SIZE;
    const key  = `${gLat}_${gLng}`;

    if (!grid[key]) grid[key] = {
      lats: [], lngs: [], names: [],
      country_ids: new Set(),
    };
    grid[key].lats.push(c.lat);
    grid[key].lngs.push(c.lng);
    grid[key].names.push(c.name);
    if (c.country_id) grid[key].country_ids.add(c.country_id.toString());
  });

  const clusters = Object.entries(grid).map(([key, g]) => ({
    key,
    lat:          g.lats.reduce((a, b) => a + b, 0) / g.lats.length,
    lng:          g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length,
    castle_count: g.lats.length,
    sample_name:  g.names[0] || '',
    nation_count: g.country_ids.size,
  })).sort((a, b) => b.castle_count - a.castle_count);

  console.log(`\n📍 지역 클러스터: ${clusters.length}개`);
  console.log(`  최다 castle 클러스터: ${clusters[0].sample_name} (${clusters[0].castle_count}개)`);

  // ── 3. 각 클러스터에 시대별 인구 부여 ────────────────
  const eraYears = Object.keys(ERA_SCALE).map(Number).sort((a, b) => a - b);

  const allDocs = clusters.map((cl, idx) => {
    // castle 수 기반 기준 인구
    const rankFactor = Math.max(0.15, 1 - idx * 0.003); // 순위 보정 (완만하게)
    const basePop = Math.min(
      cl.castle_count * BASE_POP_PER_CASTLE * rankFactor,
      MAX_POP_PER_CLUSTER
    );

    // 시대별 인구 계산
    const pop_by_year = {};
    eraYears.forEach(year => {
      pop_by_year[year] = Math.round(basePop * getEraScale(year));
    });

    // 히트맵 기준값 (1100년 기준)
    const refPop = pop_by_year[1100] || Math.round(basePop * getEraScale(1100));

    return {
      resource_type: 'population',
      source:        'geo_cluster_v3',
      name:          cl.sample_name,
      lat:           Math.round(cl.lat * 10000) / 10000,
      lng:           Math.round(cl.lng * 10000) / 10000,
      location: {
        type: 'Point',
        coordinates: [cl.lng, cl.lat],
      },
      castle_count:   cl.castle_count,
      nation_count:   cl.nation_count,
      cluster_rank:   idx + 1,
      // 대표 인구 (1100년 기준)
      density:        Math.round(refPop / 500),
      est_population: Math.round(refPop),
      force_3pct:     Math.round(refPop * 0.03),
      force_5pct:     Math.round(refPop * 0.05),
      // 시대별 인구 (핵심 필드)
      pop_by_year,
      // 히트맵 가중치
      heat_weight: Math.min(1.0, refPop / 1000000),
      era_note:    `지역 클러스터 — castle ${cl.castle_count}개, ${cl.nation_count}개 국가 거쳐감`,
      created_at:  new Date(),
      updated_at:  new Date(),
    };
  });

  // ── 4. 기존 데이터 교체 ───────────────────────────────
  const del = await db.collection('resources').deleteMany({ resource_type: 'population' });
  console.log(`\n🗑️  기존 인구 데이터 삭제: ${del.deletedCount}건`);

  const result = await db.collection('resources').insertMany(allDocs, { ordered: false });
  console.log(`✅ 지역 인구 데이터 삽입: ${result.insertedCount}건`);

  // ── 5. 결과 확인 ──────────────────────────────────────
  console.log('\n📊 상위 20개 인구 밀집 지역:');
  console.log('지역명            | castle | 1100년 인구  | 600년 인구  | 1280년 인구');
  console.log('─'.repeat(72));
  allDocs.slice(0, 20).forEach(d => {
    const name = (d.name || '').substring(0, 14).padEnd(16);
    console.log(
      `  ${name} | ${String(d.castle_count).padEnd(6)} | ` +
      `${String((d.pop_by_year[1100] || 0).toLocaleString()).padEnd(13)} | ` +
      `${String((d.pop_by_year[600]  || 0).toLocaleString()).padEnd(12)} | ` +
      `${(d.pop_by_year[1280] || 0).toLocaleString()}`
    );
  });

  // 좌표 범위
  const lats = allDocs.map(d => d.lat);
  const lngs = allDocs.map(d => d.lng);
  console.log(`\n📍 좌표 범위: lat ${Math.min(...lats).toFixed(2)}~${Math.max(...lats).toFixed(2)}, lng ${Math.min(...lngs).toFixed(2)}~${Math.max(...lngs).toFixed(2)}`);

  await client.close();
  console.log('\n🔌 완료');
}

main().catch(console.error);
