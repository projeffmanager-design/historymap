// import_korea_provinces.js
// korea-provinces.json의 17개 한국 도/특별시를 DB에 삽입

const { connectToDatabase, collections } = require('./db');
const fs = require('fs');

connectToDatabase().then(async () => {
  const kp = JSON.parse(fs.readFileSync('./korea-provinces.json', 'utf8'));
  
  let inserted = 0, updated = 0, skipped = 0;

  for (const feature of kp.features) {
    const p = feature.properties;
    const nameKo = p.name;       // 한국어: 서울특별시
    const nameEng = p.name_eng;  // 영어: Seoul
    const code = p.code;
    const geometry = feature.geometry;

    if (!nameEng || !geometry) {
      console.log('  스킵 (이름/geometry 없음):', nameKo);
      skipped++;
      continue;
    }

    // DB에서 영문 이름으로 찾기
    const existing = await collections.territories.findOne({
      $or: [
        { name: nameEng },
        { name_ko: nameKo },
        { 'properties.name': nameKo },
      ]
    });

    if (existing) {
      // 이미 있으면 geometry + name_ko 업데이트
      await collections.territories.updateOne(
        { _id: existing._id },
        { $set: { geometry, name_ko: nameKo, level: 'province' } }
      );
      console.log(`  ✅ 업데이트: ${nameEng} (${nameKo})`);
      updated++;
    } else {
      // 없으면 새로 삽입
      await collections.territories.insertOne({
        name: nameEng,
        name_ko: nameKo,
        level: 'province',
        geometry,
        source: 'korea-provinces.json',
        code,
        createdAt: new Date(),
      });
      console.log(`  ✅ 삽입: ${nameEng} (${nameKo})`);
      inserted++;
    }
  }

  const total = await collections.territories.countDocuments();
  console.log(`\n완료: 삽입 ${inserted}개, 업데이트 ${updated}개, 스킵 ${skipped}개`);
  console.log(`총 territories: ${total}개`);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
