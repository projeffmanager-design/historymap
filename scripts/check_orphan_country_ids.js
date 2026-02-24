require('dotenv').config({ path: require('path').join(__dirname, '../env') });

const uri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('realhistory');

  // 모든 countries ID 수집
  const allCountries = await db.collection('countries').find({}).project({ _id: 1 }).toArray();
  const validIds = new Set(allCountries.map(c => c._id.toString()));
  console.log('유효한 country ID 수:', validIds.size);

  // 모든 castle의 history country_id 검사
  const allCastles = await db.collection('castle').find({}).project({ name: 1, country_id: 1, history: 1 }).toArray();

  const orphans = new Map(); // orphanId → [성 이름들]
  allCastles.forEach(castle => {
    (castle.history || []).forEach(h => {
      const cid = h.country_id ? String(h.country_id) : null;
      if (cid && !validIds.has(cid)) {
        if (!orphans.has(cid)) orphans.set(cid, []);
        orphans.get(cid).push(castle.name + `(${h.start_year}~${h.end_year})`);
      }
    });
    if (castle.country_id) {
      const cid = String(castle.country_id);
      if (!validIds.has(cid)) {
        if (!orphans.has(cid)) orphans.set(cid, []);
        orphans.get(cid).push(castle.name + '(직접)');
      }
    }
  });

  if (orphans.size === 0) {
    console.log('✅ 고아 country_id 없음! 모든 참조 정상');
  } else {
    console.log('❌ 고아 country_id 발견:', orphans.size, '개');
    orphans.forEach((castleNames, orphanId) => {
      console.log(`  ${orphanId} → 참조 성: ${castleNames.join(', ')}`);
    });
  }

  await client.close();
}
main().catch(console.error);
