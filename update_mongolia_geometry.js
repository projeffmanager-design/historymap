const { connectToDatabase, collections } = require('./db');
const fs = require('fs');


require('dotenv').config({ path: './env' });

async function main() {
  await connectToDatabase();
  const col = collections.territories;
  const data = JSON.parse(fs.readFileSync('mongolia-aimags.json', 'utf8'));

  // 먼저 DB에서 Mongolia 관련 territories 확인
  const mongolDocs = await col.find(
    { $or: [{ name_ko: /몽골/ }, { name: /mongol|Dornod|Gobi|Bulgan|Selenge|Khentii|Uvs|Khovd|Bayankhongor|Orkhon|Darkhan|Arkhangai|Zavkhan|Bayan|Tov|Hovsgol|Sukhbaatar|Ovorkhangai|Govisumber|Ulaanbaatar|Dundgovi/i }] }
  ).toArray();
  
  console.log('DB 몽골 관련 territories:', mongolDocs.length);
  mongolDocs.forEach(d => console.log(' -', d.name, '|', d.name_ko));

  let updated = 0;
  let notFound = [];

  for (const feature of data.features) {
    const props = feature.properties;
    const nameLatin = props.name_en || props.name;

    // DB에서 name_en으로 매칭
    let doc = await col.findOne({
      name: { $regex: nameLatin.replace(/[-]/g, '[-\\s]?'), $options: 'i' }
    });

    // 못 찾으면 name (native)으로 시도
    if (!doc) {
      doc = await col.findOne({
        name: { $regex: props.name, $options: 'i' }
      });
    }

    if (doc) {
      await col.updateOne({ _id: doc._id }, { $set: { geometry: feature.geometry } });
      updated++;
      console.log('✓', doc.name, '<-', nameLatin);
    } else {
      notFound.push(nameLatin + ' / ' + props.name);
    }
  }

  console.log('\n업데이트:', updated, '/ 미매칭:', notFound.length);
  if (notFound.length) {
    console.log('미매칭 목록:');
    notFound.forEach(n => console.log(' -', n));
  }
  process.exit(0);
}

main().catch(console.error);
