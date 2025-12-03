require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set in environment (.env)");
  process.exit(1);
}

(async () => {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // 거란(契丹)이 침입 찾기
    const battle = await castles.findOne({ 
      name: /거란.*침입/i
    });

    if (!battle) {
      console.log('❌ "거란(契丹)이 침입"을 찾을 수 없습니다.');
      
      // 유사한 이름 찾기
      const similar = await castles.find({ 
        name: /거란/i 
      }).toArray();
      
      if (similar.length > 0) {
        console.log('\n유사한 항목들:');
        similar.forEach(c => {
          console.log(`  - ${c.name} (${c.lat}, ${c.lng})`);
          console.log(`    is_battle: ${c.is_battle}`);
          console.log(`    is_military_flag: ${c.is_military_flag}`);
          console.log(`    is_natural_feature: ${c.is_natural_feature}`);
          console.log(`    is_label: ${c.is_label}`);
          if (c.history) {
            console.log(`    history: ${c.history.length}개 레코드`);
            c.history.forEach((h, idx) => {
              console.log(`      [${idx}] ${h.name} (${h.start_year}~${h.end_year}) - is_battle: ${h.is_battle}, is_capital: ${h.is_capital}`);
            });
          }
          console.log('');
        });
      }
      
      return;
    }

    console.log('🔍 찾은 데이터:');
    console.log(`이름: ${battle.name}`);
    console.log(`좌표: (${battle.lat}, ${battle.lng})`);
    console.log(`최상위 is_battle: ${battle.is_battle}`);
    console.log(`최상위 is_military_flag: ${battle.is_military_flag}`);
    console.log(`최상위 is_natural_feature: ${battle.is_natural_feature}`);
    console.log(`최상위 is_label: ${battle.is_label}`);
    console.log(`country_id: ${battle.country_id}`);
    console.log(`built_year: ${battle.built_year}`);
    console.log(`destroyed_year: ${battle.destroyed_year}`);
    console.log('');

    if (battle.history && Array.isArray(battle.history)) {
      console.log(`📜 역사 기록: ${battle.history.length}개`);
      battle.history.forEach((h, idx) => {
        console.log(`\n  [${idx}] 이름: ${h.name}`);
        console.log(`      국가 ID: ${h.country_id}`);
        console.log(`      시작: ${h.start_year}년 ${h.start_month}월`);
        console.log(`      종료: ${h.end_year}년 ${h.end_month}월`);
        console.log(`      수도: ${h.is_capital}`);
        console.log(`      전장: ${h.is_battle}`);
      });
    } else {
      console.log('⚠️  역사 기록이 없습니다!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\n\nMongoDB 연결 종료');
  }
})();
