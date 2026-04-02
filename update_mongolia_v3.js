require('dotenv').config({ path: './env' });
const { connectToDatabase, collections } = require('./db');
const fs = require('fs');

async function main() {
  await connectToDatabase();
  const col = collections.territories;
  const data = JSON.parse(fs.readFileSync('mongolia-aimags.json', 'utf8'));

  // Name mapping: mongolia-aimags.json name_en -> possible DB name variants
  const nameMap = {
    'Dornod': ['Dornod', 'Dornod Province', '더르너드주'],
    'Bayan-Ölgii': ['Bayan-Ölgii', 'Bayan-Ulgii', 'Bayan-Ölgii Province', '바얀울기주'],
    'Khovd': ['Khovd', 'Khovd Province', '호브드주'],
    'Sükhbaatar': ['Sükhbaatar', 'Sukhbaatar', 'Sükhbaatar Province', '수흐바타르주'],
    'Dornogovi': ['Dornogovi', 'Dornogovi Province', '도르노고비주'],
    'Govi-Altai': ['Govi-Altai', 'Govi-Altay', 'Govi-Altai Province', '고비알타이주'],
    'Bayankhongor': ['Bayankhongor', 'Bayankhongor Province', '바얀홍고르주'],
    'Ömnögovi': ['Ömnögovi', 'Omnogovi', 'Ömnögovi Province', '음누고비주'],
    'Khövsgöl': ['Khövsgöl', 'Khuvsgul', 'Khövsgöl Province', '흡스굴주'],
    'Bulgan': ['Bulgan', 'Bulgan Province', '불간주'],
    'Uvs': ['Uvs', 'Uvs Province', '욱스주'],
    'Selenge': ['Selenge', 'Selenge Province', '셀렝게주'],
    'Zavkhan': ['Zavkhan', 'Zavkhan Province', '자브항주'],
    'Khentii': ['Khentii', 'Khentii Province', '헨티주'],
    'Darkhan-Uul': ['Darkhan-Uul', 'Darkhan', 'Darkhan-Uul Province', '다르항올주'],
    'Töv': ['Töv', 'Tuv', 'Töv Province', '투브주'],
    'Arkhangai': ['Arkhangai', 'Arkhangai Province', '아르항가이주'],
    'Orkhon': ['Orkhon', 'Orkhon Province', '오르홍주'],
    'Dundgovi': ['Dundgovi', 'Dundgovi Province', '둔드고비주'],
    'Övörkhangai': ['Övörkhangai', 'Uvurkhangai', 'Övörkhangai Province', '우부르항가이주'],
    'Govisümber': ['Govisümber', 'Govisumber', 'Govisümber Province', '고비숨베르주'],
    'Ulaanbaatar': ['Ulaanbaatar', 'Ulaanbataar', '울란바토르'],
  };

  let updated = 0;
  let notFound = [];
  let alreadyHasGeom = [];

  console.log(`총 ${data.features.length}개 피처 처리 시작\n`);

  for (const feature of data.features) {
    const nameEn = feature.properties.name_en || feature.properties.name;
    const geom = feature.geometry;

    // 1) nameMap의 variants로 검색
    const variants = nameMap[nameEn] || [nameEn];
    let doc = null;

    for (const v of variants) {
      doc = await col.findOne({
        $or: [
          { name: v },
          { name_en: v },
          { name_ko: v }
        ]
      });
      if (doc) break;
    }

    // 2) 못 찾으면 regex로 검색
    if (!doc) {
      const firstWord = nameEn.split('-')[0].split(' ')[0];
      if (firstWord.length >= 4) {
        doc = await col.findOne({
          name: { $regex: firstWord, $options: 'i' },
          level: 'province'
        });
      }
    }

    if (doc) {
      const hasGeom = doc.geometry && doc.geometry.type;
      await col.updateOne(
        { _id: doc._id },
        { $set: { geometry: geom } }
      );
      if (hasGeom) {
        alreadyHasGeom.push(`${nameEn} → ${doc.name} (기존 geometry 교체)`);
      } else {
        console.log(`✅ 새 geometry 추가: ${nameEn} → ${doc.name} (${doc.name_ko || ''})`);
      }
      updated++;
    } else {
      notFound.push(nameEn);
      console.log(`❌ DB에 없음: ${nameEn}`);
    }
  }

  console.log('\n=== 결과 ===');
  console.log(`업데이트 완료: ${updated}개`);
  if (alreadyHasGeom.length > 0) {
    console.log(`\n기존 geometry 교체 (${alreadyHasGeom.length}개):`);
    alreadyHasGeom.forEach(x => console.log(' -', x));
  }
  if (notFound.length > 0) {
    console.log(`\nDB에 없어서 스킵 (${notFound.length}개):`);
    notFound.forEach(x => console.log(' -', x));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
