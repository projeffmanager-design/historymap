require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set in environment (.env)");
  process.exit(1);
}

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // 제2차 진주성 전투 찾기
    const battle = await castles.findOne({ 
      _id: new ObjectId('68eaad29f2dc90e0c4dc4d11')
    });

    if (!battle) {
      console.log('❌ 해당 ID를 찾을 수 없습니다.');
      return;
    }

    console.log('🔍 찾은 데이터:');
    console.log(`이름: ${battle.name}`);
    console.log(`좌표: (${battle.lat}, ${battle.lng})`);
    console.log(`최상위 is_battle: ${battle.is_battle}`);
    console.log(`country_id: ${battle.country_id}`);
    console.log(`built_year: ${battle.built_year}`);
    console.log(`built_month: ${battle.built_month}`);
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
    
    console.log('\n\n=== 진단 ===');
    console.log(`✓ 좌표 유효: ${typeof battle.lat === 'number' && typeof battle.lng === 'number'}`);
    console.log(`✓ history 배열 존재: ${Array.isArray(battle.history)}`);
    console.log(`✓ history 배열 길이: ${battle.history?.length || 0}`);
    if (battle.history && battle.history.length > 0) {
      console.log(`✓ 첫 번째 레코드 is_battle: ${battle.history[0].is_battle}`);
      console.log(`✓ 첫 번째 레코드 start_year: ${battle.history[0].start_year}`);
      console.log(`✓ 첫 번째 레코드 end_year: ${battle.history[0].end_year}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\n\nMongoDB 연결 종료');
  }
})();
