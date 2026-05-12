/**
 * 인구 데이터 바다 포인트 정제 스크립트
 *
 * 알려진 해상(海上) 제외 구역을 정의하고, 그 안에 떨어지는
 * population 포인트를 DB에서 삭제합니다.
 *
 * 실행: node cleanup_ocean_population.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

// ──────────────────────────────────────────
// 제외 구역 (바다/사막/무인지대)
// 각 항목: [minLat, maxLat, minLng, maxLng, 설명]
// 육지 주요 도시가 포함되지 않도록 보수적으로 설정
// ──────────────────────────────────────────
const OCEAN_ZONES = [
  // 황해(黃海) 중심부
  [31.0, 37.5, 121.5, 124.5, '황해 중심부'],
  // 발해(渤海)
  [37.5, 41.0, 119.0, 122.0, '발해'],
  // 동해(東海/日本海) — 한반도·일본 사이
  [34.0, 40.0, 130.5, 136.0, '동해'],
  // 남해·동중국해
  [27.0, 32.5, 122.0, 127.0, '동중국해'],
  // 일본 남해
  [24.0, 27.5, 122.5, 126.0, '필리핀해 북부'],
  // 오호츠크해 서부
  [46.0, 56.0, 138.0, 148.0, '오호츠크해'],
  // 태평양 괌 인근 (13.4N, 144.7E)
  [12.0, 16.0, 143.0, 147.0, '서태평양 괌'],
  // 타림 분지 서쪽 사막 (카슈가르 서쪽)
  [37.0, 42.0, 73.0, 77.0, '파미르 고원/카라코룸'],
  // 티베트 고원 무인지대 (북위 32~35, 동경 82~88)
  [32.0, 36.0, 82.0, 88.0, '티베트 무인 고원'],
];

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const col = client.db('realhistory').collection('resources');

  const all = await col.find({ resource_type: 'population' }, {
    projection: { lat: 1, lng: 1 }
  }).toArray();

  console.log('전체 population 포인트:', all.length);

  const toDelete = [];

  for (const doc of all) {
    for (const [minLat, maxLat, minLng, maxLng, label] of OCEAN_ZONES) {
      if (doc.lat >= minLat && doc.lat <= maxLat &&
          doc.lng >= minLng && doc.lng <= maxLng) {
        toDelete.push({ id: doc._id, lat: doc.lat, lng: doc.lng, zone: label });
        break;
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('삭제할 해상 포인트 없음');
    await client.close();
    return;
  }

  console.log('\n🗑️  삭제 대상:');
  toDelete.forEach(d => console.log(`  (${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}) — ${d.zone}`));

  const ids = toDelete.map(d => d.id);
  const r = await col.deleteMany({ _id: { $in: ids } });

  console.log(`\n✅ 삭제 완료: ${r.deletedCount}건`);
  console.log('남은 population 포인트:', await col.countDocuments({ resource_type: 'population' }));

  await client.close();
}

main().catch(console.error);
