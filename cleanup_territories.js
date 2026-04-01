// cleanup_territories.js
// 1. 중복 제거 (old city 버전 삭제, osm_id 있는 버전 유지)
// 2. level null → province/city 수정
// 3. geometry 없는 것 → world-countries.json에서 가져오기

const { connectToDatabase, collections } = require('./db');
const fs = require('fs');
const path = require('path');

connectToDatabase().then(async () => {
  let fixed = 0;

  // ─────────────────────────────────────────────
  // 1. 중복 제거
  // ─────────────────────────────────────────────
  console.log('\n=== 1. 중복 제거 ===');

  // North Korea: city 버전(osm_id 없음) 삭제
  const r1 = await collections.territories.deleteOne({ name: 'North Korea', level: 'city', osm_id: { $exists: false } });
  console.log('  North Korea city 버전 삭제:', r1.deletedCount);

  // Kazakhstan: city 버전(osm_id 없음) 삭제
  const r2 = await collections.territories.deleteOne({ name: 'Kazakhstan', level: 'city', osm_id: { $exists: false } });
  console.log('  Kazakhstan city 버전 삭제:', r2.deletedCount);

  // Japan: city 버전(osm_id 없음) 삭제
  const r3 = await collections.territories.deleteOne({ name: 'Japan', level: 'city', osm_id: { $exists: false } });
  console.log('  Japan city 버전 삭제:', r3.deletedCount);

  // Turkmenistan: osm_id 없는 버전 삭제
  const r4 = await collections.territories.deleteOne({ name: 'Turkmenistan', osm_id: { $exists: false } });
  console.log('  Turkmenistan old 버전 삭제:', r4.deletedCount);

  // Kyrgyzstan: osm_id 없는 버전 삭제
  const r5 = await collections.territories.deleteOne({ name: 'Kyrgyzstan', osm_id: { $exists: false } });
  console.log('  Kyrgyzstan old 버전 삭제:', r5.deletedCount);

  fixed += r1.deletedCount + r2.deletedCount + r3.deletedCount + r4.deletedCount + r5.deletedCount;

  // ─────────────────────────────────────────────
  // 2. level null 수정
  // ─────────────────────────────────────────────
  console.log('\n=== 2. level null 수정 ===');

  // Kazakhstan (r214665) → province (국가급)
  const l1 = await collections.territories.updateOne(
    { name: 'Kazakhstan', osm_id: 'r214665' },
    { $set: { level: 'province' } }
  );
  console.log('  Kazakhstan → province:', l1.modifiedCount);

  // Japan (r382313) → province (국가급)
  const l2 = await collections.territories.updateOne(
    { name: 'Japan', osm_id: 'r382313' },
    { $set: { level: 'province' } }
  );
  console.log('  Japan → province:', l2.modifiedCount);

  // Kyushu Region (r1842245) → province
  const l3 = await collections.territories.updateOne(
    { name: 'Kyushu Region', osm_id: 'r1842245' },
    { $set: { level: 'province' } }
  );
  console.log('  Kyushu Region → province:', l3.modifiedCount);

  fixed += l1.modifiedCount + l2.modifiedCount + l3.modifiedCount;

  // ─────────────────────────────────────────────
  // 3. geometry 없는 것 → world-countries.json에서 채우기
  // ─────────────────────────────────────────────
  console.log('\n=== 3. geometry 없는 territories 처리 ===');

  const noGeo = await collections.territories.find(
    { geometry: { $exists: false } },
    { projection: { _id: 1, name: 1, level: 1 } }
  ).toArray();

  console.log('  geometry 없는 territories:', noGeo.map(t => t.name));

  if (noGeo.length > 0) {
    // world-countries.json 로드
    const wcData = JSON.parse(fs.readFileSync(path.join(__dirname, 'world-countries.json'), 'utf8'));
    const featureMap = {};
    for (const f of wcData.features) {
      const p = f.properties || {};
      const name = p.NAME || p.name || p.ADMIN || p.admin || '';
      if (name) featureMap[name.toLowerCase()] = f.geometry;
    }

    // north-korea.json도 로드 (다른 버전)
    const nkData = JSON.parse(fs.readFileSync(path.join(__dirname, 'north-korea.json'), 'utf8'));
    for (const f of nkData.features) {
      const p = f.properties || {};
      const name = p.NAME || p.name || p.ADMIN || p.admin || p.name_en || '';
      if (name && !featureMap[name.toLowerCase()]) {
        featureMap[name.toLowerCase()] = f.geometry;
      }
    }

    // 알려진 이름 매핑
    const nameMap = {
      'indonesia': ['Indonesia', 'Republic of Indonesia'],
      'malaysia': ['Malaysia'],
      'japan': ['Japan'],
      'north korea': ['North Korea', 'Dem. Rep. Korea', 'Democratic People\'s Republic of Korea'],
      'khabarovsk': null, // 러시아 지역 — russia-regions.json에서
      'kazakhstan': ['Kazakhstan'],
    };

    // russia-regions.json 로드
    const rrData = JSON.parse(fs.readFileSync(path.join(__dirname, 'russia-regions.json'), 'utf8'));
    const russiaFeatures = rrData.features || (rrData.type === 'Feature' ? [rrData] : []);

    for (const t of noGeo) {
      const nameLower = t.name.toLowerCase();
      let geometry = null;

      if (nameLower === 'khabarovsk') {
        // 러시아 지역에서 Хабаровский край 찾기
        const feat = russiaFeatures.find(f => {
          const p = f.properties || {};
          const n = (p.name || p.NAME || '').toLowerCase();
          return n.includes('хабаровск');
        });
        if (feat) geometry = feat.geometry;
      } else {
        // world-countries.json에서 찾기
        geometry = featureMap[nameLower];
        if (!geometry) {
          // 유사 이름 시도
          for (const [key, val] of Object.entries(featureMap)) {
            if (key.includes(nameLower) || nameLower.includes(key)) {
              geometry = val;
              break;
            }
          }
        }
      }

      if (geometry) {
        const res = await collections.territories.updateOne(
          { _id: t._id },
          { $set: { geometry } }
        );
        console.log(`  ✅ ${t.name} geometry 추가:`, res.modifiedCount);
        fixed++;
      } else {
        console.log(`  ❌ ${t.name} geometry 찾지 못함`);
      }
    }
  }

  // ─────────────────────────────────────────────
  // 4. Indonesia, Malaysia가 city로 돼있으면 province로
  // ─────────────────────────────────────────────
  console.log('\n=== 4. 국가급 city → province 수정 ===');
  const countriesAsCity = ['Indonesia', 'Malaysia', 'Singapore', 'Guam', 'Hong Kong S.A.R.'];
  // Indonesia, Malaysia는 국가이므로 province로
  for (const name of ['Indonesia', 'Malaysia']) {
    const res = await collections.territories.updateOne(
      { name, level: 'city' },
      { $set: { level: 'province' } }
    );
    if (res.modifiedCount > 0) {
      console.log(`  ${name} city → province`);
      fixed++;
    }
  }

  // ─────────────────────────────────────────────
  // 최종 상태 확인
  // ─────────────────────────────────────────────
  const total = await collections.territories.countDocuments();
  const noGeoFinal = await collections.territories.countDocuments({ geometry: { $exists: false } });
  const noLevelFinal = await collections.territories.countDocuments({ level: null });
  const byLevel = await collections.territories.aggregate([
    { $group: { _id: '$level', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();

  console.log('\n=== 최종 상태 ===');
  console.log('  총 territories:', total);
  console.log('  geometry 없음:', noGeoFinal);
  console.log('  level null:', noLevelFinal);
  console.log('  level 분포:', byLevel.map(b => `${b._id}:${b.count}`).join(', '));
  console.log(`\n총 ${fixed}건 수정 완료`);

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
