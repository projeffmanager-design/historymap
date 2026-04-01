// import_russia_regions.js
// russia-regions.json의 83개 러시아 지역 geometry를 DB에 업데이트/삽입

const { connectToDatabase, collections } = require('./db');
const fs = require('fs');

// DB 이름 → russia-regions.json name_latin 매핑
const NAME_MAP = {
  'Sakha (Yakutia)': 'Republic of Sakha (Yakutia)',
  'Irkutsk Oblast': 'Irkutsk Region',
  'Zabaykalsky Krai': 'Zabaykalsky Krai',
  'Zabaykalsky': 'Zabaykalsky Krai',
  'Tuva Republic': 'Republic of Tyva',
  'Buryatia': 'Republic of Buryatia',
  'Khabarovsk': 'Khabarovsk Krai',
  'Maga Buryatdan': 'Republic of Buryatia', // 오류 — 아래서 처리
  'Central Federal District': null,
  'Southern Federal District': null,
  'Volga Federal District': null,
  'Yevrey': 'Jewish Autonomous Oblast',
};

connectToDatabase().then(async () => {
  const rr = JSON.parse(fs.readFileSync('./russia-regions.json', 'utf8'));
  const features = rr.features || [];

  // name_latin → geometry 맵 빌드
  const geoByLatin = {};
  const geoByName = {};
  for (const f of features) {
    const p = f.properties || {};
    if (p.name_latin) geoByLatin[p.name_latin] = f.geometry;
    if (p.name) geoByName[p.name] = f.geometry;
  }

  console.log(`russia-regions.json: ${features.length}개 로드`);

  // DB에서 러시아 관련 territories 가져오기
  // Irkutsk, Sakha, Khabarovsk, Tuva, Buryatia, Zabaykalsky, Yevrey, Maga 등
  const dbTerritories = await collections.territories.find(
    {},
    { projection: { _id: 1, name: 1, name_ko: 1, level: 1, geometry: 1 } }
  ).toArray();

  let updated = 0, inserted = 0, skipped = 0;

  // 1. DB territories 중 russia-regions에서 geometry 찾아 업데이트
  for (const t of dbTerritories) {
    const mapped = NAME_MAP[t.name];
    if (mapped === null) { skipped++; continue; } // federal districts — 건너뜀

    let geometry = null;

    if (mapped) {
      geometry = geoByLatin[mapped];
    } else {
      // 직접 name_latin 매칭 시도
      geometry = geoByLatin[t.name];
      if (!geometry) {
        // 부분 매칭
        for (const [latin, geo] of Object.entries(geoByLatin)) {
          if (latin.toLowerCase().includes(t.name.toLowerCase()) ||
              t.name.toLowerCase().includes(latin.toLowerCase().replace(/republic of |region|oblast|krai|kray/gi, '').trim())) {
            geometry = geo;
            break;
          }
        }
      }
    }

    if (geometry && !t.geometry) {
      await collections.territories.updateOne(
        { _id: t._id },
        { $set: { geometry, level: t.level || 'province' } }
      );
      console.log(`  ✅ geometry 업데이트: ${t.name}`);
      updated++;
    }
  }

  // 2. russia-regions.json에서 DB에 없는 지역 삽입
  const dbNames = new Set(dbTerritories.map(t => t.name.toLowerCase()));
  
  // DB에 없는 러시아 지역 찾기
  const missingRegions = features.filter(f => {
    const latin = f.properties.name_latin || '';
    const cyrName = f.properties.name || '';
    // 이미 DB에 있는지 확인
    return !dbTerritories.some(t => {
      const mapped = NAME_MAP[t.name];
      if (mapped === latin) return true;
      return t.name.toLowerCase() === latin.toLowerCase();
    });
  });

  console.log(`\nDB에 없는 러시아 지역: ${missingRegions.length}개`);
  
  for (const f of missingRegions) {
    const p = f.properties;
    const name = p.name_latin || p.name;
    if (!name) continue;

    await collections.territories.insertOne({
      name,
      name_ko: null,
      level: 'province',
      geometry: f.geometry,
      source: 'russia-regions.json',
      createdAt: new Date(),
    });
    console.log(`  ✅ 삽입: ${name}`);
    inserted++;
  }

  const total = await collections.territories.countDocuments();
  const noGeo = await collections.territories.countDocuments({ geometry: { $exists: false } });
  console.log(`\n완료: 업데이트 ${updated}개, 삽입 ${inserted}개, 스킵 ${skipped}개`);
  console.log(`총 territories: ${total}개, geometry 없음: ${noGeo}개`);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
