// territories 컬렉션에 level 필드 추가
// - 'country': 국가급 (면적 > 100도² 또는 country-like)
// - 'province': 광역 단위 (면적 5~100도²)
// - 'city': 도시/소규모 단위 (면적 < 5도²)

const uri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('realhistory');
  
  const all = await db.collection('territories').find({}).project({
    _id: 1, name: 1, bbox: 1, properties: 1, level: 1
  }).toArray();
  
  console.log('전체 영토 수:', all.length);
  
  let stats = { country: 0, province: 0, city: 0 };
  const ops = [];
  
  for (const t of all) {
    // 이미 level이 있으면 스킵
    if (t.level) { stats[t.level] = (stats[t.level] || 0) + 1; continue; }
    
    let area = 0;
    if (t.bbox && t.bbox.maxLng != null) {
      area = (t.bbox.maxLng - t.bbox.minLng) * (t.bbox.maxLat - t.bbox.minLat);
    }
    
    let level;
    if (area >= 100) {
      level = 'country';
    } else if (area >= 5) {
      level = 'province';
    } else {
      // 면적 0인 경우(bbox 없음)는 일단 'city'로
      level = 'city';
    }
    
    stats[level]++;
    ops.push({
      updateOne: {
        filter: { _id: t._id },
        update: { $set: { level } }
      }
    });
  }
  
  if (ops.length > 0) {
    const result = await db.collection('territories').bulkWrite(ops);
    console.log('✅ level 필드 업데이트:', result.modifiedCount, '개');
  } else {
    console.log('이미 모두 level 있음');
  }
  
  console.log('분포:', stats);
  
  // 결과 확인
  const sample = await db.collection('territories').find({ level: 'province' })
    .project({ name: 1, level: 1, bbox: 1 }).limit(5).toArray();
  console.log('\nprovince 샘플:');
  sample.forEach(t => {
    const area = t.bbox ? ((t.bbox.maxLng-t.bbox.minLng)*(t.bbox.maxLat-t.bbox.minLat)).toFixed(1) : 0;
    console.log(' ', t.name, '| area:', area);
  });
  
  await client.close();
}
main().catch(console.error);
